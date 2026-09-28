import { config } from '../config'
import type { CastContext } from './behaviours'
import { damageEnemy } from './damageEnemy'
import { applyCondition, hasCondition } from './statusEffects'
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
 *
 * Its upgrades are stats, so any chain spell could have them:
 *   count       jumps after the first hit (+1 Jump)
 *   branch      its first jump also sends a plain branch (Branching)
 *   shock       its hits leave enemies shocked: +this damage taken from everything
 *   conduction  a jump onto a shocked enemy doesn't use up a jump
 *   crescendo   hits grow instead of weakening, the last one doubled
 *   overload    every Nth cast: twice the jumps, creeping (chain.creepSeconds a jump), white
 *   web         Storm Web: when it ends, its links linger and zap its enemies (chain.web*)
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
  /** Its upgrades, fixed when it was cast. */
  shock: number
  conduction: boolean
  crescendo: boolean
  branch: boolean
  /** Overload's cast: drawn white. */
  overloaded: boolean
  /** Every enemy it struck, and what it hit each for (Storm Web zaps a share of it). */
  nodes: { enemy: Enemy; hit: number }[]
  /** Storm Web: leave a web when it ends. */
  web: boolean
}

/**
 * Storm Web: a chain's links left strung between the enemies it struck,
 * following them as they move. It zaps only its own enemies — a web on them,
 * not a fence on the ground — chain.webZaps times over chain.webSeconds, each
 * zap chain.webShare of what the chain hit that enemy for, and refreshes
 * Shock each time. A link breaks when either of its enemies dies.
 */
export interface Web {
  weapon: WeaponInstance
  nodes: { enemy: Enemy; hit: number }[]
  zapsLeft: number
  /** Seconds between zaps, and until the next. */
  interval: number
  timer: number
  /** Seconds it has lived, and will live: for fading it out. */
  age: number
  life: number
  shock: number
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

  // Overload: every Nth cast has twice the jumps and creeps.
  const overloadEvery = Math.round(stat('overload'))
  let overloaded = false
  if (overloadEvery > 0) {
    weapon.streak = (weapon.streak ?? 0) + 1
    if (weapon.streak >= overloadEvery) {
      weapon.streak = 0
      overloaded = true
    }
  }
  const jumps = Math.max(0, Math.round(stat('count'))) * (overloaded ? 2 : 1)
  const chain: Chain = {
    weapon,
    x: caster.x,
    y: caster.y,
    current: first,
    struck: new Set(),
    jumpsLeft: jumps,
    hop: 0,
    damage: stat('damage'),
    falloff: stat('falloff', 1),
    jumpRange: stat('jumpRange'),
    delay: overloaded ? config.chain.creepSeconds : 0,
    timer: 0,
    shock: Math.max(0, stat('shock')),
    conduction: stat('conduction') > 0,
    crescendo: stat('crescendo') > 0,
    branch: stat('branch') > 0,
    overloaded,
    nodes: [],
    web: stat('web') > 0,
  }
  if (chain.delay <= 0) {
    runChain(world, chain)
  } else {
    // Creeping: the first hit now, the rest one at a time.
    hopOnce(world, chain)
    chain.timer = chain.delay
    if (chain.current) world.chains.push(chain)
  }
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
  // The enemy it was heading for died while it crept there: it jumps on to
  // the nearest one it hasn't struck from where it is, or ends.
  if (chain.current && chain.current.hp <= 0) chain.current = nearestUnstruck(world, chain.x, chain.y, chain.jumpRange, chain.struck)
  const enemy = chain.current
  if (!enemy) {
    finish(world, chain)
    return
  }
  chain.struck.add(enemy.id)
  // Where it goes next: the nearest enemy it hasn't struck — if it has a jump
  // left, or (Conduction) that enemy is shocked, which costs no jump.
  const candidate = nearestUnstruck(world, enemy.x, enemy.y, chain.jumpRange, chain.struck)
  const free = candidate !== undefined && chain.conduction && hasCondition(candidate, 'shocked')
  const next = candidate && (chain.jumpsLeft > 0 || free) ? candidate : undefined

  // Branching: its first jump also throws a plain branch at another enemy.
  const first = chain.hop === 0
  if (first && chain.branch) branchFrom(world, chain, enemy, next)

  // Crescendo grows instead of weakening, its last hit doubled; otherwise
  // each jump keeps `falloff` of the last.
  const scale = chain.crescendo ? (0.5 + 0.25 * chain.hop) * (next ? 1 : 2) : chain.falloff ** chain.hop
  const def = chain.weapon.def
  const hit = chain.damage * scale
  chain.nodes.push({ enemy, hit })
  damageEnemy(world, enemy, hit, chain.weapon)
  if (chain.shock > 0 && enemy.hp > 0) applyCondition(world, enemy, 'shocked', chain.shock, config.chain.shockSeconds, chain.weapon)
  spawnArtLine(world, chain.x, chain.y, enemy.x, enemy.y, chain.overloaded ? '#ffffff' : def.colour, config.combat.lineVfxSeconds, def.fx?.arc)
  if (def.fx?.hit) spawnSprite(world, def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)

  chain.x = enemy.x
  chain.y = enemy.y
  chain.hop++
  if (next && !free) chain.jumpsLeft--
  chain.current = next
  if (!next) finish(world, chain)
}

/** A chain has made its last hop: Storm Web leaves its web behind. */
function finish(world: World, chain: Chain): void {
  if (!chain.web || chain.nodes.length === 0) return
  const { webSeconds, webZaps } = config.chain
  const zaps = Math.max(1, Math.round(webZaps))
  world.webs.push({
    weapon: chain.weapon,
    nodes: chain.nodes,
    zapsLeft: zaps,
    interval: webSeconds / zaps,
    timer: webSeconds / zaps,
    age: 0,
    life: webSeconds,
    shock: chain.shock,
  })
  chain.web = false
}

/**
 * Storm Web's zaps: continuous damage like a burn (a hit would flash each
 * enemy white every zap), with a spark on each, and Shock topped up.
 */
function updateWebs(world: World, dt: number): void {
  for (let i = world.webs.length - 1; i >= 0; i--) {
    const web = world.webs[i]
    web.age += dt
    web.timer -= dt
    while (web.zapsLeft > 0 && web.timer <= 0) {
      web.zapsLeft--
      web.timer += web.interval
      const def = web.weapon.def
      for (const { enemy, hit } of web.nodes) {
        if (enemy.hp <= 0) continue
        damageEnemy(world, enemy, hit * config.chain.webShare, web.weapon, true)
        if (web.shock > 0 && enemy.hp > 0) applyCondition(world, enemy, 'shocked', web.shock, config.chain.shockSeconds, web.weapon)
        if (def.fx?.hit) spawnSprite(world, def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE * 0.7, HIT_SPARK_SECONDS, false)
      }
    }
    if (web.zapsLeft > 0) continue
    world.webs[i] = world.webs[world.webs.length - 1]
    world.webs.pop()
  }
}

/**
 * Branching: a plain arc from the first enemy to the nearest other one within
 * chain.branchRange — not the one the chain jumps to next. It's a spawn:
 * chain.branchShare of the first hit, and nothing else (no Shock). "Never the
 * same enemy twice" is the chain's own rule, so the branch's enemy isn't
 * marked struck: the chain may still reach it, and Branching can never make
 * the chain do less.
 */
function branchFrom(world: World, chain: Chain, from: Enemy, next: Enemy | undefined): void {
  const skip = new Set(chain.struck)
  if (next) skip.add(next.id)
  const target = nearestUnstruck(world, from.x, from.y, config.chain.branchRange, skip)
  if (!target) return
  damageEnemy(world, target, chain.damage * config.chain.branchShare, chain.weapon)
  const def = chain.weapon.def
  spawnArtLine(world, from.x, from.y, target.x, target.y, def.colour, config.combat.lineVfxSeconds, def.fx?.arc)
}

/** Creeping chains: each waits its delay between hops. And Storm Web's webs. */
export function updateChains(world: World, dt: number): void {
  updateWebs(world, dt)
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
