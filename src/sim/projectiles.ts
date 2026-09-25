import { config } from '../config'
import { damageEnemy } from './damageEnemy'
import { forEachEnemyNear, LARGEST_ENEMY_RADIUS } from './enemyGrid'
import { applyCondition, hasCondition } from './statusEffects'
import { enemiesInRadius } from './targeting'
import { HIT_SPARK_SECONDS, HIT_SPARK_SIZE, spawnRing, spawnSprite } from './vfx'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * Travelling projectiles — the fireball half of the spellbook.
 *
 * Generic: a projectile is a position, a velocity, some damage and a pierce
 * count. It carries its caster's tags so that anything reacting to a hit
 * later (on-hit curses, elemental procs) can tell a firebolt from an ice
 * shard without this file knowing either exists.
 *
 * What upgrades can make a bolt do — fork, come back, blow up, set things
 * burning, detonate burns, leave fire behind it — is `BoltMutations`,
 * resolved from the spell's stats at the cast. None of it knows it's
 * Firebolt's; any bolt spell whose stats say so gets it.
 */

/**
 * The extra things a bolt can do, all off for a plain bolt. Every number
 * is a spell stat (read in behaviours.ts), so upgrades switch them on.
 */
export interface BoltMutations {
  /** Smaller bolts thrown at other nearby enemies after a hit. */
  fork: number
  /** Fork on every hit rather than only the first — Hot Streak. */
  forkEveryHit: boolean
  /** Times it turns round and flies back to him, hitting everything again. */
  returns: number
  /** Blast radius on every hit, hurting everything around the target. */
  explode: number
  /** Fraction of each hit's damage left burning on the target. */
  ignite: number
  /** Hitting something burning uses the burn up in one explosion. */
  combust: boolean
  /** Burning strength of the ground it leaves along its path. */
  trail: number
}

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  /** Extra enemies it passes through after the first. */
  pierce: number
  radius: number
  colour: string
  tags: readonly string[]
  /** Seconds left before it fizzles, from range / speed at spawn. */
  life: number
  /** Enemy ids already hit, so one pass can't tick the same target twice. */
  hits: Set<number>
  /** The spell that fired it. */
  source: WeaponInstance
  /** A condition left on everything it hits, by id; see data/conditions.ts. */
  onHit: { condition: string; magnitude: number; duration: number } | null
  /** Upgrade behaviour. Absent on plain bolts, which is what forks are. */
  mutations?: BoltMutations
  /** An empowered bolt (Hot Streak): drawn bigger and brighter. */
  empowered?: boolean
  /** Runtime state for returning, forking once, and laying a trail. */
  outLife?: number
  returning?: boolean
  forked?: boolean
  trailDistance?: number
}

/**
 * A plain bolt: damage and nothing else, no mutations. What forks throw and
 * what Backdraft sprays — so an evolved Fireball forks into ordinary
 * firebolts rather than more fireballs, and nothing multiplies into chaos.
 */
export function spawnPlainBolt(
  world: World,
  source: WeaponInstance,
  x: number,
  y: number,
  angle: number,
  damage: number,
  reach: number,
  ignoreId?: number,
): void {
  const speed = source.def.stats.speed ?? 360
  world.projectiles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    pierce: 0,
    radius: config.combat.projectileRadius * config.combat.plainBoltSize,
    colour: source.def.colour,
    tags: source.def.tags,
    life: reach / speed,
    hits: ignoreId === undefined ? new Set() : new Set([ignoreId]),
    source,
    onHit: null,
  })
}

const forkScratch: Enemy[] = []
const blastScratch: Enemy[] = []

/** Forks: the nearest other enemies to the one just hit, one plain bolt each. */
function fork(world: World, projectile: Projectile, from: Enemy, count: number): void {
  const reach = config.combat.forkRange
  const nearby = enemiesInRadius(world, from.x, from.y, reach, forkScratch)
    .filter((enemy) => enemy.hp > 0 && enemy !== from && !projectile.hits.has(enemy.id))
    .sort((a, b) => (a.x - from.x) ** 2 + (a.y - from.y) ** 2 - ((b.x - from.x) ** 2 + (b.y - from.y) ** 2))
  for (let i = 0; i < Math.min(count, nearby.length); i++) {
    const target = nearby[i]
    const angle = Math.atan2(target.y - from.y, target.x - from.x)
    spawnPlainBolt(world, projectile.source, from.x, from.y, angle, projectile.damage * config.combat.forkDamage, reach * 1.3, from.id)
  }
}

/** Fireball's blast: everything around the target, not the target itself. */
function explode(world: World, projectile: Projectile, at: Enemy, radius: number): void {
  const damage = projectile.damage * config.combat.explodeDamage
  for (const enemy of enemiesInRadius(world, at.x, at.y, radius, blastScratch)) {
    if (enemy !== at && enemy.hp > 0) damageEnemy(world, enemy, damage, projectile.source)
  }
  spawnSprite(world, 'explosion', at.x, at.y, radius * 1.9, 0.45, true)
}

/** What's left of every burn on an enemy, whoever lit it, taken off it. */
function takeBurns(enemy: Enemy): number {
  let total = 0
  for (let i = enemy.effects.length - 1; i >= 0; i--) {
    const effect = enemy.effects[i]
    if (effect.condition !== 'burning') continue
    total += effect.magnitude * Math.max(0, effect.remaining)
    enemy.effects.splice(i, 1)
  }
  return total
}

/**
 * Combustion: the burn goes off all at once, hurting everything near it. Any
 * other burning enemy caught in it goes off too — whichever spell lit it —
 * so a burning crowd can chain, up to `combustionChain` explosions.
 */
function combust(world: World, first: Enemy, source: WeaponInstance): void {
  const queue: Enemy[] = [first]
  const seen = new Set<number>([first.id])
  const { combustionRadius, combustionChain } = config.combat
  let explosions = 0
  while (queue.length > 0 && explosions < combustionChain) {
    const enemy = queue.shift()!
    const damage = takeBurns(enemy)
    if (damage <= 0) continue
    explosions++
    for (const other of enemiesInRadius(world, enemy.x, enemy.y, combustionRadius, blastScratch)) {
      if (other.hp <= 0) continue
      if (other !== enemy && !seen.has(other.id) && hasCondition(other, 'burning')) {
        seen.add(other.id)
        queue.push(other)
      }
      damageEnemy(world, other, damage, source)
    }
    spawnSprite(world, 'explosion', enemy.x, enemy.y, combustionRadius * 1.6, 0.4, true)
  }
}

/** Phoenix Bolt's trail: a small patch of burning ground every few steps. */
function layTrail(world: World, projectile: Projectile, strength: number, moved: number): void {
  const { trailSpacing, trailRadius, trailSeconds, trailBurnSeconds } = config.combat
  projectile.trailDistance = (projectile.trailDistance ?? 0) + moved
  if (projectile.trailDistance < trailSpacing) return
  projectile.trailDistance = 0
  world.zones.push({
    x: projectile.x,
    y: projectile.y,
    radius: trailRadius,
    delay: 0,
    delayTotal: 0,
    remaining: trailSeconds,
    durationTotal: trailSeconds,
    burst: 0,
    dps: 0,
    pull: 0,
    root: 0,
    slow: 0,
    strikeRate: 0,
    strikeDamage: 0,
    strikeRadius: 0,
    strikeCredit: 0,
    landed: true,
    colour: projectile.colour,
    source: projectile.source,
    condition: { id: 'burning', magnitude: strength, duration: trailBurnSeconds },
    quiet: true,
  })
}

/**
 * Turn round and head back to him. Everything can be hit again on the way
 * back, and nothing stops it: the return pierces everything between it and
 * him. With its outward pierce given back instead, a pack in the way used
 * it up and the bolt vanished halfway home.
 */
function turnBack(projectile: Projectile): void {
  if (!projectile.mutations) return
  projectile.mutations.returns--
  projectile.returning = true
  projectile.hits.clear()
  projectile.forked = false
  projectile.pierce = Infinity
  projectile.life = (projectile.outLife ?? 1) * 1.5
  projectile.vx = -projectile.vx
  projectile.vy = -projectile.vy
}

/** One hit on one enemy: damage, sparks, conditions, and everything the bolt's upgrades add. */
function hit(world: World, projectile: Projectile, enemy: Enemy): void {
  const mutations = projectile.mutations
  projectile.hits.add(enemy.id)
  // Checked before this hit's own burn lands: Combustion detonates the
  // burn that was already there, then Ignite lights a fresh one.
  const wasBurning = mutations?.combust === true && hasCondition(enemy, 'burning')
  damageEnemy(world, enemy, projectile.damage, projectile.source)
  const spark = projectile.source.def.fx?.hit
  if (spark) spawnSprite(world, spark, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)
  const onHit = projectile.onHit
  if (onHit && enemy.hp > 0) applyCondition(world, enemy, onHit.condition, onHit.magnitude, onHit.duration, projectile.source)

  if (mutations) {
    if (wasBurning) combust(world, enemy, projectile.source)
    if (mutations.ignite > 0 && enemy.hp > 0) {
      const seconds = config.combat.igniteSeconds
      applyCondition(world, enemy, 'burning', (projectile.damage * mutations.ignite) / seconds, seconds, projectile.source)
    }
    if (mutations.explode > 0) explode(world, projectile, enemy, mutations.explode)
    if (mutations.fork > 0 && (mutations.forkEveryHit || !projectile.forked)) {
      fork(world, projectile, enemy, mutations.fork)
      projectile.forked = true
    }
  }
}

export function updateProjectiles(world: World, dt: number): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const projectile = world.projectiles[i]
    const mutations = projectile.mutations

    // On the way back, it homes on him wherever he's got to.
    if (projectile.returning) {
      const c = world.character
      const dx = c.x - projectile.x
      const dy = c.y - projectile.y
      const distance = Math.hypot(dx, dy)
      const speed = Math.hypot(projectile.vx, projectile.vy)
      if (distance < c.radius + projectile.radius) {
        world.projectiles[i] = world.projectiles[world.projectiles.length - 1]
        world.projectiles.pop()
        continue
      }
      projectile.vx = (dx / distance) * speed
      projectile.vy = (dy / distance) * speed
    }

    projectile.x += projectile.vx * dt
    projectile.y += projectile.vy * dt
    projectile.life -= dt
    if (mutations && mutations.trail > 0) layTrail(world, projectile, mutations.trail, Math.hypot(projectile.vx, projectile.vy) * dt)

    let spent = projectile.life <= 0
    if (spent && mutations && mutations.returns > 0 && !projectile.returning) {
      turnBack(projectile)
      spent = false
    }

    if (!spent) {
      const reach = projectile.radius + config.combat.projectileHitPadding

      forEachEnemyNear(world, projectile.x, projectile.y, reach + LARGEST_ENEMY_RADIUS, (enemy) => {
        if (spent) return
        if (projectile.hits.has(enemy.id)) return

        const dx = enemy.x - projectile.x
        const dy = enemy.y - projectile.y
        const hitRange = enemy.def.radius + reach
        if (dx * dx + dy * dy > hitRange * hitRange) return

        hit(world, projectile, enemy)
        if (projectile.pierce > 0) projectile.pierce--
        else if (mutations && mutations.returns > 0 && !projectile.returning) {
          // It bounces off the enemy that stopped it — and that bounce is its
          // hit on the way back, since it's heading away from it from here on.
          // The bounce is free, and so is everything after it: it flies all
          // the way back to him through whatever's in the way. (Spending the
          // bounce ended the bolt on the spot, so it only ever came back
          // from a miss.)
          turnBack(projectile)
          hit(world, projectile, enemy)
        } else spent = true
      })
    }

    if (!spent) continue

    world.projectiles[i] = world.projectiles[world.projectiles.length - 1]
    world.projectiles.pop()
  }
}

/** A ring where an empowered bolt goes off, so a Hot Streak reads as an event. */
export function markEmpowered(world: World, x: number, y: number, colour: string): void {
  spawnRing(world, x, y, 34, colour, 0.35)
}
