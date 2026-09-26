import { config } from '../config'
import type { SummonDef } from '../data/types'
import { findWeaponDef } from '../data/weapons'
import { nearestEnemy, pickTargets } from './targeting'
import type { Caster, Enemy, WeaponInstance, World } from './world'

/**
 * Summons: anything conjured into the world that casts spells of its own. A
 * companion at his side, a Righteous Fire left burning on the grass, a
 * lightning serpent coiling through the crowd — one thing with a few parts,
 * each chosen in its entry (data/summons.ts):
 *
 *   its spells     cast by it, from where it stands (it's their caster)
 *   how it moves   one of the movements below, by name
 *   how long       a lifetime, or until it's sent away
 *   a body         segments trailing its head, which 'body' spells hurt along
 *
 * The movements, each a small rule of its own:
 *
 *   leash    a companion: back to him when he gets away (hurrying, or
 *            reappearing beside him if it's lost), to its distance from an
 *            enemy near him, otherwise wandering about near him
 *   still    stays where it was put
 *   drift    wanders from spot to spot near him, turning smoothly
 *   seek     heads for the biggest crowd near him and circles over it
 *   circle   circles him
 *   slither  a serpent: weaves its way to the crowd near him, body trailing
 *
 * Everything but `still` and `circle` keeps within its leash of him and
 * reappears beside him if it's left far behind. Where something wanders to is
 * measured from him, so it drifts along when he walks.
 *
 * No danger map, no collisions: enemies ignore summons and they can't be
 * hurt, so they have nothing to be careful about. His AI never changes for
 * them (the AI rule in the spellbook).
 */

export interface Summon extends Caster {
  def: SummonDef
  side: 'player'
  /** What a companion is doing: catching up, fighting, or pottering about. */
  mode: 'follow' | 'fight' | 'roam'
  /** Where it's wandering to, measured from him, and how long until it picks another. */
  roamX: number
  roamY: number
  roamWait: number
  /** The way it's heading, in radians. Drifting, seeking and slithering turn this smoothly. */
  heading: number
  /** circle: where round him it is. */
  orbitAngle: number
  /** seek, slither: seconds until it looks for the crowd again, and the crowd it found. */
  retarget: number
  target: { x: number; y: number } | null
  /** Seconds left before it fades. Infinity for one that stays. */
  remaining: number
  /** Its body, head first, when it has one. */
  body?: { x: number; y: number }[]
  /** Its own spells, cast from where it stands. Never his: they're not in world.weapons. */
  weapons: WeaponInstance[]
  /** Seconds since it appeared, for drawing it on its own rhythm and for its weave. */
  age: number
}

/**
 * Conjures one: at `at` if given (a fire on the grass where he stands),
 * otherwise just behind him.
 */
export function summon(world: World, def: SummonDef, at?: { x: number; y: number }): Summon {
  const c = world.character
  const x = at?.x ?? c.x - c.facingX * 40
  const y = at?.y ?? c.y - c.facingY * 40
  const heading = Math.atan2(c.facingY, c.facingX)
  const summoned: Summon = {
    def,
    side: 'player',
    x,
    y,
    facingX: c.facingX,
    facingY: c.facingY,
    mode: 'roam',
    roamX: x - c.x,
    roamY: y - c.y,
    roamWait: 0,
    heading,
    orbitAngle: Math.atan2(y - c.y, x - c.x),
    retarget: 0,
    target: null,
    remaining: def.duration > 0 ? def.duration : Infinity,
    weapons: [],
    age: 0,
  }
  if (def.body) {
    // Laid out behind its head, the way it's facing.
    summoned.body = Array.from({ length: def.body.segments + 1 }, (_, i) => ({
      x: x - Math.cos(heading) * def.body!.spacing * i,
      y: y - Math.sin(heading) * def.body!.spacing * i,
    }))
  }
  summoned.weapons = def.spells.map((id) => ({
    def: findWeaponDef(id),
    caster: summoned,
    cooldownRemaining: 0.3,
    timesCast: 0,
    idleSeconds: 0,
    damageDealt: 0,
  }))
  world.summons.push(summoned)
  return summoned
}

/** Sends one away. Anything it has already thrown carries on. */
export function dismiss(world: World, summoned: Summon): void {
  const index = world.summons.indexOf(summoned)
  if (index >= 0) world.summons.splice(index, 1)
}

/** Every spell being cast this run: his, then each summon's. */
export function allWeapons(world: World): WeaponInstance[] {
  if (world.summons.length === 0) return world.weapons
  return [...world.weapons, ...world.summons.flatMap((summoned) => summoned.weapons)]
}

/** Every step, after he has moved: each summon ages, moves, and drags its body after it. */
export function updateSummons(world: World, dt: number): void {
  if (world.state !== 'running') return
  for (let i = world.summons.length - 1; i >= 0; i--) {
    const summoned = world.summons[i]
    summoned.age += dt
    summoned.remaining -= dt
    if (summoned.remaining <= 0) {
      world.summons.splice(i, 1)
      continue
    }
    MOVEMENTS[summoned.def.movement](world, summoned, dt)
    if (summoned.body) followBody(summoned)
  }
}

type Movement = (world: World, summoned: Summon, dt: number) => void

const scratch: Enemy[] = []

/** A fresh spot to wander to, somewhere round him within `spread`. */
function newRoamSpot(world: World, summoned: Summon, spread: number): void {
  const angle = world.rng() * Math.PI * 2
  const distance = Math.sqrt(world.rng()) * spread
  summoned.roamX = Math.cos(angle) * distance
  summoned.roamY = Math.sin(angle) * distance
}

/**
 * Left far behind — he outran it, or it was summoned somewhere odd: it
 * reappears beside him, body and all. Whether it did.
 */
function lost(world: World, summoned: Summon): boolean {
  const c = world.character
  if (Math.hypot(c.x - summoned.x, c.y - summoned.y) <= summoned.def.leash * config.summons.teleportAt) return false
  summoned.x = c.x - c.facingX * 40
  summoned.y = c.y - c.facingY * 40
  if (summoned.body) for (const point of summoned.body) {
    point.x = summoned.x
    point.y = summoned.y
  }
  return true
}

/** Straight towards a point at up to `pace` times its speed, stopping on it. For a companion. */
function walkTo(summoned: Summon, x: number, y: number, pace: number, dt: number): void {
  const dx = x - summoned.x
  const dy = y - summoned.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return
  const step = Math.min(distance, summoned.def.speed * pace * dt)
  summoned.x += (dx / distance) * step
  summoned.y += (dy / distance) * step
}

/**
 * Always moving, turning towards a point at no more than its turn rate — so
 * its path curves instead of snapping, and near its target it circles it.
 * `weave` swings its actual direction either side of its heading.
 */
function steerTo(summoned: Summon, x: number, y: number, dt: number, turnRate = summoned.def.turnRate ?? 3, weave = 0): void {
  const want = Math.atan2(y - summoned.y, x - summoned.x)
  let turn = want - summoned.heading
  turn = Math.atan2(Math.sin(turn), Math.cos(turn))
  const most = turnRate * dt
  summoned.heading += Math.max(-most, Math.min(most, turn))
  const direction = summoned.heading + weave
  summoned.facingX = Math.cos(direction)
  summoned.facingY = Math.sin(direction)
  summoned.x += summoned.facingX * summoned.def.speed * dt
  summoned.y += summoned.facingY * summoned.def.speed * dt
}

/** Where a free-moving summon should head: back to him if it's strayed past its leash, otherwise `x, y`. */
function withinLeash(world: World, summoned: Summon, x: number, y: number): { x: number; y: number; turn: number } {
  const c = world.character
  const turnRate = summoned.def.turnRate ?? 3
  if (Math.hypot(c.x - summoned.x, c.y - summoned.y) > summoned.def.leash) return { x: c.x, y: c.y, turn: turnRate * 2 }
  return { x, y, turn: turnRate }
}

/** The biggest crowd near him, looked for again every `summons.seekRetarget` seconds. */
function crowdNearHim(world: World, summoned: Summon, dt: number): { x: number; y: number } | null {
  summoned.retarget -= dt
  if (summoned.retarget <= 0) {
    summoned.retarget = config.summons.seekRetarget
    const c = world.character
    const [found] = pickTargets(world, c.x, c.y, summoned.def.reach, 1, config.summons.crowdRadius, 'densest', scratch)
    summoned.target = found ? { x: found.x, y: found.y } : null
  }
  return summoned.target
}

/** The spot it's wandering to, measured from him; a new one when it gets there or after a while. */
function roamSpot(world: World, summoned: Summon, dt: number, spread: number, pause: number): { x: number; y: number } {
  const c = world.character
  const x = c.x + summoned.roamX
  const y = c.y + summoned.roamY
  summoned.roamWait -= dt
  if (Math.hypot(x - summoned.x, y - summoned.y) < 20 || summoned.roamWait <= 0) {
    newRoamSpot(world, summoned, spread)
    summoned.roamWait = pause
  }
  return { x: c.x + summoned.roamX, y: c.y + summoned.roamY }
}

const leash: Movement = (world, summoned, dt) => {
  const c = world.character
  const { leash: range, reach, engageDistance = 120 } = summoned.def
  const { catchUpAt, catchUp, roamSpread, roamPause, engageSlack } = config.summons
  if (lost(world, summoned)) {
    summoned.mode = 'follow'
    return
  }
  const toHim = Math.hypot(c.x - summoned.x, c.y - summoned.y)
  if (toHim > range) {
    // Back inside its leash, not onto his feet.
    summoned.mode = 'follow'
    const x = c.x + ((summoned.x - c.x) / toHim) * range * 0.5
    const y = c.y + ((summoned.y - c.y) / toHim) * range * 0.5
    faceTowards(summoned, x, y)
    walkTo(summoned, x, y, toHim > range * catchUpAt ? catchUp : 1, dt)
    return
  }
  const foe = nearestEnemy(world, c.x, c.y, reach)
  if (foe) {
    summoned.mode = 'fight'
    const dx = summoned.x - foe.x
    const dy = summoned.y - foe.y
    const distance = Math.hypot(dx, dy) || 1
    let x = summoned.x
    let y = summoned.y
    // Off its preferred distance: to the right spot on the line between
    // them. Near enough: it holds there and casts.
    if (Math.abs(distance - engageDistance) > engageDistance * engageSlack) {
      x = foe.x + (dx / distance) * engageDistance
      y = foe.y + (dy / distance) * engageDistance
    }
    // Never further from him than its leash, chasing something.
    const out = Math.hypot(x - c.x, y - c.y)
    if (out > range) {
      x = c.x + ((x - c.x) / out) * range
      y = c.y + ((y - c.y) / out) * range
    }
    walkTo(summoned, x, y, 1, dt)
    faceTowards(summoned, foe.x, foe.y)
    return
  }
  summoned.mode = 'roam'
  const x = c.x + summoned.roamX
  const y = c.y + summoned.roamY
  if (Math.hypot(x - summoned.x, y - summoned.y) < 6) {
    summoned.roamWait -= dt
    if (summoned.roamWait <= 0) {
      newRoamSpot(world, summoned, range * roamSpread)
      summoned.roamWait = roamPause
    }
  }
  faceTowards(summoned, x, y)
  walkTo(summoned, x, y, 1, dt)
}

function faceTowards(summoned: Summon, x: number, y: number): void {
  const dx = x - summoned.x
  const dy = y - summoned.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return
  summoned.facingX = dx / distance
  summoned.facingY = dy / distance
}

const still: Movement = () => {}

const drift: Movement = (world, summoned, dt) => {
  if (lost(world, summoned)) return
  const spot = roamSpot(world, summoned, dt, summoned.def.leash * config.summons.roamSpread, config.summons.driftRetarget)
  const aim = withinLeash(world, summoned, spot.x, spot.y)
  steerTo(summoned, aim.x, aim.y, dt, aim.turn)
}

const seek: Movement = (world, summoned, dt) => {
  if (lost(world, summoned)) return
  const crowd = crowdNearHim(world, summoned, dt)
  const spot = crowd ?? roamSpot(world, summoned, dt, summoned.def.leash * config.summons.roamSpread, config.summons.driftRetarget)
  const aim = withinLeash(world, summoned, spot.x, spot.y)
  steerTo(summoned, aim.x, aim.y, dt, aim.turn)
}

const circle: Movement = (world, summoned, dt) => {
  const c = world.character
  const radius = summoned.def.orbitRadius ?? 80
  summoned.orbitAngle += (summoned.def.speed / radius) * dt
  summoned.x = c.x + Math.cos(summoned.orbitAngle) * radius
  summoned.y = c.y + Math.sin(summoned.orbitAngle) * radius
  // Facing along its way round.
  summoned.facingX = -Math.sin(summoned.orbitAngle)
  summoned.facingY = Math.cos(summoned.orbitAngle)
}

const slither: Movement = (world, summoned, dt) => {
  if (lost(world, summoned)) return
  const crowd = crowdNearHim(world, summoned, dt)
  const spot = crowd ?? roamSpot(world, summoned, dt, summoned.def.leash * config.summons.roamSpread, config.summons.driftRetarget)
  const aim = withinLeash(world, summoned, spot.x, spot.y)
  const weave = (summoned.def.weave ?? 0) * Math.sin(summoned.age * (summoned.def.weaveRate ?? 0))
  steerTo(summoned, aim.x, aim.y, dt, aim.turn, weave)
}

const MOVEMENTS: Record<SummonDef['movement'], Movement> = { leash, still, drift, seek, circle, slither }

/** Its body, dragged after its head: each segment stays within its spacing of the one before. */
function followBody(summoned: Summon): void {
  const body = summoned.body!
  const spacing = summoned.def.body!.spacing
  body[0].x = summoned.x
  body[0].y = summoned.y
  for (let i = 1; i < body.length; i++) {
    const ahead = body[i - 1]
    const point = body[i]
    const dx = point.x - ahead.x
    const dy = point.y - ahead.y
    const distance = Math.hypot(dx, dy)
    if (distance <= spacing) continue
    point.x = ahead.x + (dx / distance) * spacing
    point.y = ahead.y + (dy / distance) * spacing
  }
}
