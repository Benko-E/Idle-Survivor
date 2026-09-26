import { config } from '../config'
import type { Behaviour } from './behaviours'
import { forEachEnemyNear, LARGEST_ENEMY_RADIUS } from './enemyGrid'
import { spawnPlainBolt, type Projectile } from './projectiles'
import { enemiesInRadius, pickTargets } from './targeting'
import { spawnSprite } from './vfx'
import type { Caster, Enemy, WeaponInstance, World } from './world'
import type { Zone } from './zones'

/**
 * Walls: Firewall, and anything later that raises a line of something on the
 * ground.
 *
 * A wall is a zone (sim/zones.ts) with a shape: a straight strip, or one bent
 * round into a closed ring. Everything a zone does — burn what's touching it
 * every second, leave a condition on it — works the same; what's here is the
 * geometry and the things only a wall does:
 *
 *   where it goes      just in front of the biggest crowd, across its path,
 *                      so the whole crowd walks through it chasing him.
 *                      Kiting Lane lays it behind him along his path instead;
 *                      Burning Ring closes it round the crowd.
 *   coals              Hot Coals: what touches it keeps burning after
 *   embers             Wall of Embers: it spits little bolts at what's near
 *   kiln               Kiln: any bolt of his that comes through it comes out
 *                      hotter and sets its target burning — once per bolt,
 *                      however many walls or sides of a ring it crosses
 *   hungry             Hungry Flames: every kill inside it keeps it going
 *                      longer, up to its full duration again
 *   creep              Creeping Blaze: it creeps towards the crowd, growing
 *   engage             Wall Dancer: he keeps it between himself and the
 *                      crowd (sim/engagement.ts)
 *
 * Only `maxWalls` of a spell's walls stand at once; a new one puts out the
 * oldest. Enemies don't avoid them — walking into the fire is the point — and
 * they never hurt him.
 */

export interface WallShape {
  kind: 'line' | 'ring'
  /** Along the wall, a unit vector. A ring doesn't use it. */
  dirX: number
  dirY: number
  /** Half its length. A ring's size is its zone's radius instead. */
  halfLength: number
  /** Half its thickness. */
  halfWidth: number
  /** When it went up, so the oldest is the one that goes at the cap. */
  bornAt: number
  /** Wall of Embers: embers a second, the fraction of one carried between steps, and each one's hit. */
  embers: number
  emberCredit: number
  emberDamage: number
  /** Kiln: extra damage, as a fraction, for a bolt that comes through it. */
  kiln: number
  /** Hungry Flames: seconds each kill inside it adds, up to its full duration. */
  hungry: number
  /** Creeping Blaze: its velocity, and how fast it lengthens, up to maxHalfLength. */
  creepX: number
  creepY: number
  grow: number
  maxHalfLength: number
}

/** Something counts as in the fire once this much of its body is. */
const TOUCH = 0.5

const targetScratch: Enemy[] = []
const packScratch: Enemy[] = []

interface Placement {
  x: number
  y: number
  dirX: number
  dirY: number
  /** Which way is towards the crowd, for Creeping Blaze. */
  towardX: number
  towardY: number
}

/**
 * The biggest crowd in range, if it's big enough to be worth a wall: its
 * members and its middle.
 */
function findPack(world: World, c: Caster, range: number): { pack: Enemy[]; x: number; y: number } | null {
  const { packRadius, minPack } = config.wall
  const [target] = pickTargets(world, c.x, c.y, range, 1, packRadius, 'densest', targetScratch)
  if (!target) return null
  const pack = enemiesInRadius(world, target.x, target.y, packRadius, packScratch)
  if (pack.length < minPack) return null
  let x = 0
  let y = 0
  for (const enemy of pack) {
    x += enemy.x
    y += enemy.y
  }
  return { pack, x: x / pack.length, y: y / pack.length }
}

/**
 * Base Firewall: across the crowd's path, a little in front of its leading
 * edge — between him and the crowd, so every one of them has to walk through
 * it to reach him.
 */
function placeAcross(world: World, c: Caster, range: number): Placement | null {
  const found = findPack(world, c, range)
  if (!found) return null
  let ux = found.x - c.x
  let uy = found.y - c.y
  const distance = Math.hypot(ux, uy)
  if (distance < 1e-6) {
    ux = c.facingX
    uy = c.facingY
  } else {
    ux /= distance
    uy /= distance
  }
  // The leading edge: the member of the crowd nearest him along that line.
  let front = Infinity
  for (const enemy of found.pack) front = Math.min(front, (enemy.x - c.x) * ux + (enemy.y - c.y) * uy)
  const along = Math.max(config.wall.minDistance, front - config.wall.lead)
  return { x: c.x + ux * along, y: c.y + uy * along, dirX: -uy, dirY: ux, towardX: ux, towardY: uy }
}

/**
 * Kiting Lane: from just behind him out through the crowd chasing him — the
 * line it will run down to reach him, which is the way he's fleeing along.
 * Everything chasing him heads for the same point, so near him the whole
 * crowd funnels into it and runs the rest of its length.
 */
function placeLane(world: World, c: Caster, range: number, length: number): Placement | null {
  const found = findPack(world, c, range)
  if (!found) return null
  let ux = found.x - c.x
  let uy = found.y - c.y
  const distance = Math.hypot(ux, uy)
  if (distance < 1e-6) {
    ux = -c.facingX
    uy = -c.facingY
  } else {
    ux /= distance
    uy /= distance
  }
  let leftOf = 0
  for (const enemy of found.pack) if ((enemy.x - c.x) * -uy + (enemy.y - c.y) * ux > 0) leftOf++
  // Its far end just past the middle of the crowd, so they're in the fire
  // from the start; never nearer him than the gap.
  const { laneGap, packRadius } = config.wall
  const out = Math.max(laneGap + length / 2, distance + packRadius * 0.5 - length / 2)
  // Creeping, it drifts to whichever side more of them are on.
  const side = leftOf * 2 >= found.pack.length ? 1 : -1
  return { x: c.x + ux * out, y: c.y + uy * out, dirX: ux, dirY: uy, towardX: -uy * side, towardY: ux * side }
}

/** Burning Ring: closed round the crowd, centred on its middle. */
function placeRing(world: World, c: Caster, range: number): Placement | null {
  const found = findPack(world, c, range)
  if (!found) return null
  return { x: found.x, y: found.y, dirX: 1, dirY: 0, towardX: 0, towardY: 0 }
}

/** Puts out a spell's oldest walls until there's room for one more. */
function makeRoom(world: World, weapon: WeaponInstance, max: number): void {
  for (;;) {
    let count = 0
    let oldest = -1
    for (let i = 0; i < world.zones.length; i++) {
      const wall = world.zones[i].wall
      if (!wall || world.zones[i].source !== weapon) continue
      count++
      if (oldest < 0 || wall.bornAt < world.zones[oldest].wall!.bornAt) oldest = i
    }
    if (count < max || oldest < 0) return
    world.zones.splice(oldest, 1)
  }
}

/** Raises a wall. Waits, ready, while there's no crowd worth one. */
export const castWall: Behaviour = ({ world, weapon, caster, stat }) => {
  const length = stat('area')
  const range = stat('range')
  const ring = stat('ring') > 0
  const lane = !ring && stat('lane') > 0
  const place = ring ? placeRing(world, caster, range) : lane ? placeLane(world, caster, range, length) : placeAcross(world, caster, range)
  if (!place) return false

  makeRoom(world, weapon, Math.max(1, Math.round(stat('maxWalls', 1))))

  const { coalsSeconds, emberDamage, ringRadius, creepSpeed, creepGrowth, creepMaxGrowth } = config.wall
  const halfWidth = Math.max(4, stat('width') / 2)
  const halfLength = ring ? 0 : length / 2
  const dps = stat('dotDamage')
  const coals = stat('coals')
  const duration = stat('duration')
  const creep = !ring && stat('creep') > 0
  world.zones.push({
    x: place.x,
    y: place.y,
    // A strip's reach from its middle; a ring's own radius.
    radius: ring ? length * ringRadius : halfLength + halfWidth,
    delay: 0,
    delayTotal: 0,
    remaining: duration,
    durationTotal: duration,
    burst: 0,
    dps,
    pull: 0,
    root: 0,
    slow: 0,
    strikeRate: 0,
    strikeDamage: 0,
    strikeRadius: 0,
    strikeCredit: 0,
    landed: true,
    colour: weapon.def.colour,
    source: weapon,
    condition: coals > 0 ? { id: 'burning', magnitude: dps * coals, duration: coalsSeconds } : undefined,
    wall: {
      kind: ring ? 'ring' : 'line',
      dirX: place.dirX,
      dirY: place.dirY,
      halfLength,
      halfWidth,
      bornAt: world.time,
      embers: stat('embers'),
      emberCredit: 0,
      emberDamage: dps * emberDamage,
      kiln: stat('kiln'),
      hungry: stat('hungry'),
      creepX: creep ? place.towardX * creepSpeed : 0,
      creepY: creep ? place.towardY * creepSpeed : 0,
      grow: creep ? halfLength * creepGrowth : 0,
      maxHalfLength: halfLength * (1 + (creep ? creepMaxGrowth : 0)),
    },
  })
  return true
}

/** How far a point is from the wall's middle line: along a strip, or round a ring. */
export function wallDistance(zone: Zone, x: number, y: number): number {
  const wall = zone.wall!
  const dx = x - zone.x
  const dy = y - zone.y
  if (wall.kind === 'ring') return Math.abs(Math.hypot(dx, dy) - zone.radius)
  const t = Math.max(-wall.halfLength, Math.min(wall.halfLength, dx * wall.dirX + dy * wall.dirY))
  return Math.hypot(dx - t * wall.dirX, dy - t * wall.dirY)
}

/** Whether something `size` across its middle, at (x, y), is in the fire. */
export function touchesWall(zone: Zone, x: number, y: number, size: number): boolean {
  return wallDistance(zone, x, y) <= zone.wall!.halfWidth + size
}

/** Everything in a wall's fire right now. Collects into `out`. */
export function wallContents(world: World, zone: Zone, out: Enemy[]): Enemy[] {
  out.length = 0
  const wall = zone.wall!
  const reach = (wall.kind === 'ring' ? zone.radius : wall.halfLength) + wall.halfWidth + LARGEST_ENEMY_RADIUS
  forEachEnemyNear(world, zone.x, zone.y, reach, (enemy) => {
    if (enemy.hp > 0 && touchesWall(zone, enemy.x, enemy.y, enemy.def.radius * TOUCH)) out.push(enemy)
  })
  return out
}

/**
 * Whether the straight way from one point to another goes through the wall:
 * what an enemy walking at him would have to do, or a bolt just did. For a
 * ring, one end inside and the other out.
 */
export function crossesWall(zone: Zone, x0: number, y0: number, x1: number, y1: number): boolean {
  const wall = zone.wall!
  if (wall.kind === 'ring') {
    const r2 = zone.radius * zone.radius
    const in0 = (x0 - zone.x) ** 2 + (y0 - zone.y) ** 2 < r2
    const in1 = (x1 - zone.x) ** 2 + (y1 - zone.y) ** 2 < r2
    return in0 !== in1
  }
  // Which side of the middle line each end is on; different sides, and where
  // it crosses is along the wall's length.
  const nx = -wall.dirY
  const ny = wall.dirX
  const s0 = (x0 - zone.x) * nx + (y0 - zone.y) * ny
  const s1 = (x1 - zone.x) * nx + (y1 - zone.y) * ny
  if (s0 * s1 > 0 || s0 === s1) return false
  const t0 = (x0 - zone.x) * wall.dirX + (y0 - zone.y) * wall.dirY
  const t1 = (x1 - zone.x) * wall.dirX + (y1 - zone.y) * wall.dirY
  return Math.abs(t0 + ((t1 - t0) * s0) / (s0 - s1)) <= wall.halfLength
}

/** A spell's walls that are up right now. */
export function activeWalls(world: World, weapon: WeaponInstance): Zone[] {
  return world.zones.filter((zone) => zone.wall !== undefined && zone.source === weapon && zone.remaining > 0)
}

/** Every step a wall is up, before it burns: creeping, growing, spitting embers. */
export function updateWall(world: World, zone: Zone, dt: number): void {
  const wall = zone.wall!
  zone.x += wall.creepX * dt
  zone.y += wall.creepY * dt
  if (wall.grow > 0 && wall.halfLength < wall.maxHalfLength) {
    wall.halfLength = Math.min(wall.maxHalfLength, wall.halfLength + wall.grow * dt)
    zone.radius = wall.halfLength + wall.halfWidth
  }
  if (wall.embers > 0) spitEmbers(world, zone, dt)
}

/** A random spot along the fire. */
function pointOnWall(world: World, zone: Zone): { x: number; y: number } {
  const wall = zone.wall!
  if (wall.kind === 'ring') {
    const angle = world.rng() * Math.PI * 2
    return { x: zone.x + Math.cos(angle) * zone.radius, y: zone.y + Math.sin(angle) * zone.radius }
  }
  const t = (world.rng() * 2 - 1) * wall.halfLength
  return { x: zone.x + wall.dirX * t, y: zone.y + wall.dirY * t }
}

/**
 * Wall of Embers: little plain bolts from along the fire at the nearest enemy
 * that isn't already in it. Born in the fire, so Kiln leaves them alone.
 */
function spitEmbers(world: World, zone: Zone, dt: number): void {
  const wall = zone.wall!
  wall.emberCredit += wall.embers * dt
  const range = config.wall.emberRange
  while (wall.emberCredit >= 1) {
    wall.emberCredit -= 1
    const from = pointOnWall(world, zone)
    const target = nearestOutside(world, zone, from.x, from.y, range)
    if (!target) continue
    const angle = Math.atan2(target.y - from.y, target.x - from.x)
    const ember = spawnPlainBolt(world, zone.source, from.x, from.y, angle, wall.emberDamage, range * 1.3)
    ember.kilned = true
  }
}

/** The nearest living enemy within range of a point that isn't in the wall's fire already. */
function nearestOutside(world: World, zone: Zone, x: number, y: number, range: number): Enemy | null {
  let found: Enemy | null = null
  let best = range * range
  forEachEnemyNear(world, x, y, range, (enemy) => {
    if (enemy.hp <= 0 || touchesWall(zone, enemy.x, enemy.y, enemy.def.radius * TOUCH)) return
    const d2 = (enemy.x - x) ** 2 + (enemy.y - y) ** 2
    if (d2 >= best) return
    best = d2
    found = enemy
  })
  return found
}

/** Hungry Flames: a kill inside a hungry wall keeps it burning longer, up to its full duration. */
export function wallKill(world: World, enemy: Enemy): void {
  for (const zone of world.zones) {
    const wall = zone.wall
    if (!wall || wall.hungry <= 0 || zone.remaining <= 0) continue
    if (!touchesWall(zone, enemy.x, enemy.y, enemy.def.radius * TOUCH)) continue
    zone.remaining = Math.min(zone.durationTotal, zone.remaining + wall.hungry)
  }
}

/** The walls a bolt could be fired up by this step: those with Kiln. Collects into `out`. */
export function kilnWalls(world: World, out: Zone[]): Zone[] {
  out.length = 0
  for (const zone of world.zones) if (zone.wall && zone.wall.kiln > 0 && zone.remaining > 0) out.push(zone)
  return out
}

/**
 * Kiln: a bolt that has just come through one of these walls — touched its
 * fire, or crossed it in one step — comes out hotter and leaves its targets
 * burning. Once per bolt, whatever it crosses after.
 */
export function kilnPass(world: World, projectile: Projectile, walls: Zone[], fromX: number, fromY: number): void {
  if (projectile.kilned) return
  for (const zone of walls) {
    const through =
      touchesWall(zone, projectile.x, projectile.y, projectile.radius) || crossesWall(zone, fromX, fromY, projectile.x, projectile.y)
    if (!through) continue
    projectile.kilned = true
    projectile.damage *= 1 + zone.wall!.kiln
    projectile.kilnBurn = zone.source
    spawnSprite(world, 'hit_fire', projectile.x, projectile.y, 20, 0.25, false)
    return
  }
}
