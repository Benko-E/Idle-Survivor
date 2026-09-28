import { config } from '../config'
import type { CastContext } from './behaviours'
import { damageEnemy } from './damageEnemy'
import { enemiesInRadius } from './targeting'
import { HIT_SPARK_SECONDS, HIT_SPARK_SIZE, spawnArtLine, spawnSprite } from './vfx'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * The new build's chains: lightning that strikes the nearest enemy, then
 * jumps from each enemy to the nearest one it hasn't struck yet. Chain
 * Lightning, and one day a ranger's chaining shot. (The old build's Chain
 * Lightning is the 'chain' behaviour in behaviours.ts, left as it was.)
 *
 * A chain is a thing that hops. An ordinary cast runs every hop at once; a
 * creeping one waits `delay` between hops and lives in world.chains until
 * it's done. Before each hop strikes, the chain finds where it goes next, so
 * it always knows whether this hit is its last.
 */

export interface Chain {
  weapon: WeaponInstance
  /** Where the next link starts: the caster, then each enemy struck. */
  x: number
  y: number
  /** The enemy the next hop strikes; undefined once the chain is spent. */
  current?: Enemy
  /** Enemies already struck: never twice in one chain. */
  struck: Set<number>
  /** Jumps still to make after the current hop. */
  jumpsLeft: number
  /** How many hits it has made so far. */
  hop: number
  /** Its first hit, and what each jump keeps of the last. */
  damage: number
  falloff: number
  jumpRange: number
  /** Seconds between hops (0: all at once), and until the next. */
  delay: number
  timer: number
}

const scratch: Enemy[] = []

/** The nearest living enemy within `range` of (x, y) that the chain hasn't struck. */
function nearestUnstruck(world: World, x: number, y: number, range: number, struck: Set<number>): Enemy | undefined {
  let best: Enemy | undefined
  let bestDistance = Infinity
  for (const enemy of enemiesInRadius(world, x, y, range, scratch)) {
    if (enemy.hp <= 0 || struck.has(enemy.id)) continue
    const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = enemy
    }
  }
  return best
}

/** The arc behaviour, registered in sim/behaviours.ts. */
export function castArc({ world, weapon, caster, stat }: CastContext): boolean {
  const first = nearestUnstruck(world, caster.x, caster.y, stat('range'), new Set())
  if (!first) return false
  const chain: Chain = {
    weapon,
    x: caster.x,
    y: caster.y,
    current: first,
    struck: new Set(),
    jumpsLeft: Math.max(0, Math.round(stat('count'))),
    hop: 0,
    damage: stat('damage'),
    falloff: stat('falloff', 1),
    jumpRange: stat('jumpRange'),
    delay: 0,
    timer: 0,
  }
  if (chain.delay <= 0) runChain(world, chain)
  else world.chains.push(chain)
  return true
}

/** Run a chain to its end, right now. */
function runChain(world: World, chain: Chain): void {
  let guard = 0
  while (chain.current && guard++ < 1000) hopOnce(world, chain)
}

/**
 * One hop: find where it goes next (so it knows if this is the last hit),
 * strike the current enemy, draw the link, move on.
 */
function hopOnce(world: World, chain: Chain): void {
  const enemy = chain.current
  if (!enemy) return
  chain.struck.add(enemy.id)
  const next = chain.jumpsLeft > 0 ? nearestUnstruck(world, enemy.x, enemy.y, chain.jumpRange, chain.struck) : undefined

  const def = chain.weapon.def
  damageEnemy(world, enemy, chain.damage * chain.falloff ** chain.hop, chain.weapon)
  spawnArtLine(world, chain.x, chain.y, enemy.x, enemy.y, def.colour, config.combat.lineVfxSeconds, def.fx?.arc)
  if (def.fx?.hit) spawnSprite(world, def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)

  chain.x = enemy.x
  chain.y = enemy.y
  chain.hop++
  if (next) chain.jumpsLeft--
  chain.current = next
}

/** Creeping chains: each waits its delay between hops. */
export function updateChains(world: World, dt: number): void {
  for (let i = world.chains.length - 1; i >= 0; i--) {
    const chain = world.chains[i]
    chain.timer -= dt
    while (chain.current && chain.timer <= 0) {
      hopOnce(world, chain)
      chain.timer += chain.delay
    }
    if (chain.current) continue
    world.chains[i] = world.chains[world.chains.length - 1]
    world.chains.pop()
  }
}
