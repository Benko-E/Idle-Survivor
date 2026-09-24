import { damageEnemy } from './damageEnemy'
import { applyCondition } from './statusEffects'
import { enemiesInRadius } from './targeting'
import { spawnLine, spawnRing, spawnSprite } from './vfx'
import type { Enemy, WeaponInstance, World } from './world'

/** How long a zone's chill lingers on an enemy that steps out of it. */
const CHILL_LINGER = 0.4

/**
 * Patches of ground a spell has claimed: a lightning strike about to land, a
 * meteor on its way down, a vortex dragging things in, roots bursting up.
 *
 * One generic thing with a few numbers, rather than a system per spell. Each
 * zone waits out a `delay` (drawn on the ground as a warning), lands — dealing
 * any `burst` damage and rooting what it caught — and then stays active for
 * `remaining` seconds, burning, pulling, chilling or striking whatever is
 * inside. Which of those a spell uses is just which numbers it sets; the rest
 * are zero.
 */

export interface Zone {
  x: number
  y: number
  radius: number
  /** Seconds until it lands. */
  delay: number
  /** The delay it started with, for drawing the warning's progress. */
  delayTotal: number
  /** Seconds left active after landing. */
  remaining: number
  /** The active time it started with, for drawing. */
  durationTotal: number
  /** Damage dealt once, to everything inside, on landing. */
  burst: number
  /** Damage per second to everything inside while active. */
  dps: number
  /** World units per second enemies inside are dragged towards the centre. */
  pull: number
  /** Seconds enemies caught on landing are rooted for. */
  root: number
  /** Fraction of speed removed from everything inside while active. */
  slow: number
  /** Strikes per second while active, each on a random enemy inside. */
  strikeRate: number
  /** Damage of each strike, to everything within `strikeRadius` of it. */
  strikeDamage: number
  strikeRadius: number
  /** Fractional strikes carried between frames. */
  strikeCredit: number
  landed: boolean
  colour: string
  source: WeaponInstance
}

const scratch: Enemy[] = []

function land(world: World, zone: Zone): void {
  zone.landed = true
  const caught = enemiesInRadius(world, zone.x, zone.y, zone.radius, scratch)
  for (const enemy of caught) {
    if (zone.burst > 0) damageEnemy(world, enemy, zone.burst, zone.source)
    if (zone.root > 0 && enemy.hp > 0) applyCondition(world, enemy, 'rooted', 1, zone.root, zone.source)
  }

  const impact = zone.source.def.fx?.impact
  if (impact) {
    spawnSprite(world, impact, zone.x, zone.y, zone.radius * 1.9, 0.6, true)
    return
  }
  // A one-off strike gets a bolt from above; anything that lingers draws
  // itself while it's active instead.
  if (zone.burst > 0 && zone.remaining <= 0) {
    spawnLine(world, zone.x, zone.y - 220, zone.x, zone.y, zone.colour, 0.18)
  }
  spawnRing(world, zone.x, zone.y, zone.radius, zone.colour, 0.4)
}

/** Lightning out of a storm: a random enemy inside, and everything near it. */
function strike(world: World, zone: Zone, inside: Enemy[], dt: number): void {
  zone.strikeCredit += zone.strikeRate * dt
  while (zone.strikeCredit >= 1) {
    zone.strikeCredit -= 1
    const target = inside[Math.floor(world.rng() * inside.length)]
    const tx = target.x
    const ty = target.y
    // Copied out first: the scratch list is about to be reused for the blast.
    for (const enemy of enemiesInRadius(world, tx, ty, zone.strikeRadius, strikeScratch)) {
      damageEnemy(world, enemy, zone.strikeDamage, zone.source)
    }
    const bolt = zone.source.def.fx?.strike
    if (bolt) {
      spawnSprite(world, bolt, tx, ty, zone.strikeRadius * 1.3, 0.36, true)
    } else {
      spawnLine(world, tx, ty - 200, tx, ty, zone.colour, 0.14)
      spawnRing(world, tx, ty, zone.strikeRadius, zone.colour, 0.25)
    }
  }
}

const strikeScratch: Enemy[] = []

export function updateZones(world: World, dt: number): void {
  for (let i = world.zones.length - 1; i >= 0; i--) {
    const zone = world.zones[i]

    if (!zone.landed) {
      zone.delay -= dt
      if (zone.delay > 0) continue
      land(world, zone)
    }

    if (zone.remaining > 0) {
      const inside = enemiesInRadius(world, zone.x, zone.y, zone.radius, scratch)
      for (const enemy of inside) {
        if (zone.slow > 0) applyCondition(world, enemy, 'chilled', zone.slow, CHILL_LINGER, zone.source)
        if (zone.dps > 0) damageEnemy(world, enemy, zone.dps * dt, zone.source, true)
        if (zone.pull > 0) {
          const dx = zone.x - enemy.x
          const dy = zone.y - enemy.y
          const distance = Math.hypot(dx, dy)
          // Never past the centre: a pull that overshot would fling things
          // out the other side and read as a push.
          const step = Math.min(distance, zone.pull * dt)
          if (distance > 0.001) {
            enemy.x += (dx / distance) * step
            enemy.y += (dy / distance) * step
          }
        }
      }
      if (zone.strikeRate > 0 && inside.length > 0) strike(world, zone, inside, dt)
      zone.remaining -= dt
    }

    if (zone.remaining > 0) continue
    world.zones[i] = world.zones[world.zones.length - 1]
    world.zones.pop()
  }
}
