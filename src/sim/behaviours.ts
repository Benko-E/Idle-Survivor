import { config } from '../config'
import type { WeaponDef } from '../data/types'
import { damageEnemy } from './damageEnemy'
import { auraBurn, auraRadius } from './auras'
import { type BoltMutations } from './projectiles'
import { applyCondition } from './statusEffects'
import { orbitPositions } from './orbit'
import { enemiesInRadius, nearestEnemies, nearestEnemy, pickTargets } from './targeting'
import { HIT_SPARK_SECONDS, HIT_SPARK_SIZE, spawnArtLine, spawnRing, spawnSprite } from './vfx'
import { castWall } from './walls'
import type { Caster, Enemy, WeaponInstance, World } from './world'

/**
 * The behaviour registry. (agreed extension to spec 5.1)
 *
 * This is the honest boundary of "content is data". A new spell that reuses an
 * existing pattern — a stronger firebolt, an ice shard, a triple-cast variant —
 * is a data entry and nothing else. A genuinely new *kind* of spell is a data
 * entry plus one function registered below.
 *
 * What matters is that nothing in here names a specific spell. Every function
 * reads its numbers from `stat()`, which resolves the caster's data entry
 * through the modifier system. 'projectile' has no idea it is usually Firebolt.
 */

export interface CastContext {
  world: World
  /** The spell being cast, credited with everything it causes. */
  weapon: WeaponInstance
  /** Who's casting it, and from where: him, a summon, one day a boss. */
  caster: Caster
  def: WeaponDef
  /** Base value from the data entry, resolved through all active modifiers. */
  /** A stat, through every modifier in play. `fallback` is its base when the spell doesn't list it: 1 for a multiplier. */
  stat: (key: string, fallback?: number) => number
}

/**
 * Returns whether the cast actually did anything.
 *
 * A spell with nothing in range used to go on cooldown anyway: Chain
 * Lightning would fire at thin air, then sit out 2.7 seconds while an enemy
 * walked into range. Reporting a miss lets the caller keep the spell ready
 * instead, and stops empty casts inflating the per-spell cast counter that
 * exists to show when a spell never finds a target.
 */
export type Behaviour = (context: CastContext) => boolean

/** Reused between casts so a busy frame doesn't allocate. */
const scratchTargets: Enemy[] = []

/**
 * Fires one or more travelling bolts, each at a different nearby enemy.
 * Firebolt, and anything else that throws something.
 *
 * Extra bolts pick the next-nearest targets rather than fanning around one
 * aim line. The fan was so narrow that every bolt landed on the same enemy,
 * which turned "+1 projectile" into "+100% damage to one target" — by far the
 * strongest pick in the draft, and nothing like what it says. Only once there
 * are more bolts than targets do they double up, fanned by `spread`.
 */
const projectile: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const range = stat('range')
  const count = Math.max(1, Math.round(stat('count')))

  // His side aims at the nearest enemies; the enemies' side aims at him.
  const foe = caster.side === 'enemy'
  const targets: readonly { x: number; y: number }[] = foe
    ? aimAtHim(world, caster, range)
    : nearestEnemies(world, caster.x, caster.y, range, count, scratchTargets)
  if (targets.length === 0) return false

  // Evolutions reshape the bolt through these three, not through its damage
  // and speed themselves, so the plain bolts it forks into stay plain.
  const speed = stat('speed') * stat('boltSpeed', 1)
  const spread = stat('spread')
  const damage = stat('damage') * stat('boltDamage', 1)
  const pierce = Math.max(0, Math.round(stat('pierce')))
  const size = (stat('size') || config.combat.projectileRadius) * stat('boltSize', 1)

  // What upgrades have made the bolts do. Undefined — a plain bolt — when none.
  const mutations: BoltMutations = {
    fork: Math.max(0, Math.round(stat('fork'))),
    forkEveryHit: false,
    returns: Math.max(0, Math.round(stat('returns'))),
    explode: Math.max(0, stat('explode')),
    ignite: Math.max(0, stat('ignite')),
    combust: stat('combustion') > 0,
    trail: Math.max(0, stat('flameTrail')),
  }
  const mutated = mutations.fork > 0 || mutations.returns > 0 || mutations.explode > 0 || mutations.ignite > 0 || mutations.combust || mutations.trail > 0

  // Hot Streak: every Nth cast, the first bolt is an empowered one.
  const streakEvery = Math.round(stat('hotStreak'))
  let empowered = false
  if (streakEvery > 0) {
    weapon.streak = (weapon.streak ?? 0) + 1
    if (weapon.streak >= streakEvery) {
      weapon.streak = 0
      empowered = true
    }
  }

  // Whatever lingers on a hit: a chill if the spell slows, its damage over
  // time if it has some. Neither for a plain bolt.
  const duration = stat('duration')
  const slow = stat('slow')
  const burn = stat('dotDamage')
  const onHit =
    duration <= 0
      ? null
      : slow > 0
        ? { condition: 'chilled', magnitude: slow, duration }
        : burn > 0
          ? { condition: def.dotCondition ?? 'burning', magnitude: burn, duration }
          : null

  for (let i = 0; i < count; i++) {
    const target = targets[i % targets.length]
    // Bolts beyond the number of targets go round again, fanned out either
    // side of the line: +spread, -spread, +2 spread...
    const round = Math.floor(i / targets.length)
    const offset = round === 0 ? 0 : Math.ceil(round / 2) * spread * (round % 2 === 1 ? 1 : -1)
    const angle = Math.atan2(target.y - caster.y, target.x - caster.x) + offset

    // The empowered bolt pierces everything, forks off every enemy it goes
    // through, hits harder, is bigger and flies further.
    const hot = empowered && i === 0
    const reach = hot ? config.combat.hotStreakRange : range
    const life = speed > 0 ? reach / speed : 0
    const boltPierce = hot ? 999 : pierce
    world.projectiles.push({
      x: caster.x,
      y: caster.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: hot ? damage * config.combat.hotStreakDamage : damage,
      pierce: boltPierce,
      // A spell can set its own bolt size — Frozen Orb is a big slow ball.
      radius: hot ? size * config.combat.hotStreakSize : size,
      colour: def.colour,
      tags: def.tags,
      life,
      hits: new Set(),
      source: weapon,
      // He has no conditions for a chill to go on.
      onHit: foe ? null : onHit,
      side: foe ? 'enemy' : undefined,
      mutations: mutated || hot ? { ...mutations, fork: hot ? Math.max(1, mutations.fork) : mutations.fork, forkEveryHit: hot } : undefined,
      empowered: hot,
      outLife: life,
    })
  }

  return true
}

const aimScratch: { x: number; y: number }[] = []

/** An enemy caster's target: him, if he's in range. */
function aimAtHim(world: World, caster: Caster, range: number): { x: number; y: number }[] {
  const c = world.character
  aimScratch.length = 0
  if ((c.x - caster.x) ** 2 + (c.y - caster.y) ** 2 <= range * range) aimScratch.push(c)
  return aimScratch
}

/**
 * A burst centred on the caster that damages and chills everything caught in
 * it. Frost Nova, and any other "get away from me" spell.
 */
const nova: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const area = stat('area')
  const damage = stat('damage')
  const slow = stat('slow')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  // Held back until something is in reach, like every other spell. It used to
  // go off on its timer regardless, spending its cooldown on an empty ring.
  if (targets.length === 0) return false

  for (const enemy of targets) {
    damageEnemy(world, enemy, damage, weapon)
    if (slow > 0 && duration > 0) applyCondition(world, enemy, 'chilled', slow, duration, weapon)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
  return true
}

/**
 * Strikes the nearest enemy, then leaps to the nearest enemy to *that* one,
 * losing power with each jump. Chain Lightning.
 */
const chain: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const jumps = Math.max(1, Math.round(stat('count')))
  const jumpRange = stat('jumpRange')
  const falloff = stat('falloff')

  let current = nearestEnemy(world, caster.x, caster.y, stat('range'))
  if (!current) return false

  const struck = new Set<number>()
  let damage = stat('damage')
  let fromX = caster.x
  let fromY = caster.y

  for (let jump = 0; jump < jumps && current; jump++) {
    struck.add(current.id)
    damageEnemy(world, current, damage, weapon)
    spawnArtLine(world, fromX, fromY, current.x, current.y, def.colour, config.combat.lineVfxSeconds, def.fx?.arc)
    if (def.fx?.hit) spawnSprite(world, def.fx.hit, current.x, current.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)

    fromX = current.x
    fromY = current.y
    damage *= falloff
    current = nearestEnemy(world, current.x, current.y, jumpRange, struck)
  }

  return true
}

/**
 * Lays a lingering affliction on everything nearby. No immediate damage — it
 * all arrives over the duration. Curse of Withering.
 */
const curse: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const area = stat('area')
  const dotDamage = stat('dotDamage')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  if (targets.length === 0) return false

  for (const enemy of targets) {
    applyCondition(world, enemy, def.dotCondition ?? 'burning', dotDamage, duration, weapon)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
  return true
}

/**
 * A burn on everything within reach of him, refreshed every cooldown.
 * Righteous Fire. No ring on each refresh — it's drawn as a steady glow for as
 * long as he has it, because a pulse every 0.4s would be a strobe.
 */
const aura: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const targets = enemiesInRadius(world, caster.x, caster.y, auraRadius(world, weapon), scratchTargets)
  if (targets.length === 0) return false

  // Its pyre, his health and his upgrades all in the one number; see sim/auras.ts.
  const burn = auraBurn(world, weapon)
  const duration = stat('duration')
  const beacon = stat('beacon')
  // Zealotry's little auras burn with the full pyre, lit or not.
  const zealotry = stat('zealotry') > 0 ? stat('dotDamage') * (1 + stat('pyreDamage')) : 0
  for (const enemy of targets) {
    applyCondition(world, enemy, def.dotCondition ?? 'burning', burn, duration, weapon)
    if (beacon > 0) applyCondition(world, enemy, 'beaconed', beacon, config.aura.beaconSeconds, weapon)
    if (zealotry > 0) applyCondition(world, enemy, 'zealotry', zealotry, duration, weapon)
  }
  return true
}

/**
 * Claims a patch of ground somewhere near him: a lightning strike, a meteor,
 * a vortex, roots. Everything about what the patch does is in its numbers;
 * see sim/zones.ts.
 */
const zone: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const area = stat('area')
  const count = Math.max(1, Math.round(stat('count')))
  const targets = pickTargets(world, caster.x, caster.y, stat('range'), count, area, def.targeting ?? 'densest', scratchTargets)
  if (targets.length === 0) return false

  const delay = Math.max(0, stat('delay'))
  const duration = Math.max(0, stat('duration'))
  const strikeRate = Math.max(0, stat('strikeRate'))
  for (const target of targets) {
    world.zones.push({
      x: target.x,
      y: target.y,
      radius: area,
      delay,
      delayTotal: delay,
      remaining: duration,
      durationTotal: duration,
      // A storm's damage comes in strikes, not all at once when it arrives.
      burst: strikeRate > 0 ? 0 : stat('damage'),
      dps: stat('dotDamage'),
      pull: stat('pull'),
      root: stat('root'),
      slow: stat('slow'),
      strikeRate,
      strikeDamage: strikeRate > 0 ? stat('damage') : 0,
      strikeRadius: stat('strikeRadius'),
      strikeCredit: 0,
      landed: false,
      colour: def.colour,
      source: weapon,
    })
  }
  return true
}

/**
 * Orbs circling him that hurt whatever they touch. Ball Lightning.
 *
 * "Casts" on a short tick rather than once per cooldown: each tick checks
 * what the orbs are touching. `rehit` is how soon one enemy can be hit again,
 * so an orb sweeping through a crowd hits each of them once per pass.
 */
const orbit: Behaviour = ({ world, weapon, stat }) => {
  const size = stat('size')
  const damage = stat('damage')
  const rehit = stat('rehit')
  const log = (weapon.hitLog ??= new Map())
  let hitAny = false

  for (const orb of orbitPositions(world, weapon)) {
    for (const enemy of enemiesInRadius(world, orb.x, orb.y, size + enemyReach, scratchTargets)) {
      if ((enemy.x - orb.x) ** 2 + (enemy.y - orb.y) ** 2 > (size + enemy.def.radius) ** 2) continue
      const last = log.get(enemy.id)
      if (last !== undefined && world.time - last < rehit) continue
      log.set(enemy.id, world.time)
      damageEnemy(world, enemy, damage, weapon)
      if (weapon.def.fx?.hit) spawnSprite(world, weapon.def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)
      hitAny = true
    }
  }

  // Forget enemies that have long since died or wandered off.
  if (log.size > 500) for (const [id, time] of log) if (world.time - time > rehit) log.delete(id)
  return hitAny
}

/** Slack when asking the grid what an orb might touch: the biggest enemy's radius. */
const enemyReach = 20

/**
 * Hurts whatever touches its caster's body: a lightning serpent's coils. Like
 * an orbit, it "casts" on a short tick, and `rehit` stops one enemy being hit
 * sixty times a second. `size` is how thick the body is. A caster without a
 * body has nothing to hurt with.
 */
const body: Behaviour = ({ world, weapon, caster, stat }) => {
  const points = caster.body
  if (!points || points.length < 2) return false
  const half = stat('size') / 2
  const damage = stat('damage')
  const rehit = stat('rehit')
  const log = (weapon.hitLog ??= new Map())
  let hitAny = false

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const reach = Math.hypot(b.x - a.x, b.y - a.y) / 2 + half + enemyReach
    for (const enemy of enemiesInRadius(world, midX, midY, reach, scratchTargets)) {
      if (enemy.hp <= 0 || distanceToSegment(enemy.x, enemy.y, a, b) > half + enemy.def.radius * 0.5) continue
      const last = log.get(enemy.id)
      if (last !== undefined && world.time - last < rehit) continue
      log.set(enemy.id, world.time)
      damageEnemy(world, enemy, damage, weapon)
      if (weapon.def.fx?.hit) spawnSprite(world, weapon.def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)
      hitAny = true
    }
  }

  if (log.size > 500) for (const [id, time] of log) if (world.time - time > rehit) log.delete(id)
  return hitAny
}

function distanceToSegment(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared)) : 0
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
}

/**
 * The behaviours an enemy can cast, at him. Only bolts so far: the rest still
 * look for enemies to hurt, so an enemy casting them is skipped (with a
 * warning) until each learns to hurt him instead. The data side of an enemy
 * casting — a spell list on its entry, and it as the caster — is for the step
 * that adds the first boss.
 */
export const ENEMY_CASTABLE = new Set(['projectile'])

export const BEHAVIOURS: Record<string, Behaviour> = {
  projectile,
  nova,
  chain,
  curse,
  aura,
  zone,
  orbit,
  // A strip of fire in front of the crowd, or a ring round it: sim/walls.ts.
  wall: castWall,
  body,
}
