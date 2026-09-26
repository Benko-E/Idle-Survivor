import { config } from '../config'
import type { CompanionDef } from '../data/types'
import { findWeaponDef } from '../data/weapons'
import { nearestEnemy } from './targeting'
import type { Caster, WeaponInstance, World } from './world'

/**
 * Companions: whatever fights at his side — a wizard's elemental, a ranger's
 * wolf, a warlock's demon. What one is lives in data/companions.ts; this is
 * how they behave.
 *
 * Deliberately simple. A companion is on a leash to him and does one of three
 * things:
 *
 *   follow  he's got further away than its leash: it heads back to him,
 *           hurrying if it's well behind, reappearing beside him if it's lost
 *   fight   an enemy is within its reach *of him*: it goes to its preferred
 *           distance from the nearest one, never leaving its leash
 *   roam    nothing to do: it wanders about near him, and since where it
 *           wanders is measured from him, it drifts along when he walks
 *
 * No danger map and no collisions: enemies ignore it and it can't be hurt,
 * so it has nothing to be careful about. It casts its spells itself, from
 * where it stands (each of its WeaponInstances names it as the caster), and
 * his AI never changes for it.
 */

export interface Companion extends Caster {
  def: CompanionDef
  side: 'player'
  mode: 'follow' | 'fight' | 'roam'
  /** Where it's wandering to, measured from him, and how long it lingers once there. */
  roamX: number
  roamY: number
  roamWait: number
  /** Its own spells, cast from where it stands. Never his: they're not in world.weapons. */
  weapons: WeaponInstance[]
  /** Seconds since it was summoned, for drawing it floating on its own rhythm. */
  age: number
}

/** Brings a companion to his side: just behind him, ready to cast. */
export function summonCompanion(world: World, def: CompanionDef): Companion {
  const c = world.character
  const companion: Companion = {
    def,
    side: 'player',
    x: c.x - c.facingX * 40,
    y: c.y - c.facingY * 40,
    facingX: c.facingX,
    facingY: c.facingY,
    mode: 'roam',
    roamX: -c.facingX * 40,
    roamY: -c.facingY * 40,
    roamWait: 0,
    weapons: [],
    age: 0,
  }
  companion.weapons = def.spells.map((id) => ({
    def: findWeaponDef(id),
    caster: companion,
    cooldownRemaining: 0.5,
    timesCast: 0,
    idleSeconds: 0,
    damageDealt: 0,
  }))
  world.companions.push(companion)
  return companion
}

/** Sends one away. Anything it has already thrown carries on. */
export function dismissCompanion(world: World, companion: Companion): void {
  const index = world.companions.indexOf(companion)
  if (index >= 0) world.companions.splice(index, 1)
}

/** Every spell being cast this run: his, then each companion's. */
export function allWeapons(world: World): WeaponInstance[] {
  if (world.companions.length === 0) return world.weapons
  return [...world.weapons, ...world.companions.flatMap((companion) => companion.weapons)]
}

/** A fresh spot to wander to, somewhere round him. */
function newRoamSpot(world: World, companion: Companion): void {
  const spread = companion.def.leash * config.companions.roamSpread
  const angle = world.rng() * Math.PI * 2
  const distance = Math.sqrt(world.rng()) * spread
  companion.roamX = Math.cos(angle) * distance
  companion.roamY = Math.sin(angle) * distance
}

/** Every step, after he has moved: each companion follows, fights or roams. */
export function updateCompanions(world: World, dt: number): void {
  if (world.state !== 'running') return
  const c = world.character
  const { catchUpAt, catchUp, teleportAt, roamPause, engageSlack } = config.companions
  for (const companion of world.companions) {
    companion.age += dt
    const { leash, reach, engageDistance, speed } = companion.def
    const toHim = Math.hypot(c.x - companion.x, c.y - companion.y)

    // Lost: he outran it by miles, or it was summoned somewhere odd.
    if (toHim > leash * teleportAt) {
      companion.x = c.x - c.facingX * 40
      companion.y = c.y - c.facingY * 40
      companion.mode = 'follow'
      continue
    }

    let targetX = companion.x
    let targetY = companion.y
    let pace = 1
    let faceX = 0
    let faceY = 0
    if (toHim > leash) {
      // Back inside its leash, not onto his feet.
      companion.mode = 'follow'
      targetX = c.x + ((companion.x - c.x) / toHim) * leash * 0.5
      targetY = c.y + ((companion.y - c.y) / toHim) * leash * 0.5
      pace = toHim > leash * catchUpAt ? catchUp : 1
    } else {
      const foe = nearestEnemy(world, c.x, c.y, reach)
      if (foe) {
        companion.mode = 'fight'
        const dx = companion.x - foe.x
        const dy = companion.y - foe.y
        const distance = Math.hypot(dx, dy) || 1
        // Off its preferred distance: to the right spot on the line between
        // them. Near enough: it holds there and casts.
        if (Math.abs(distance - engageDistance) > engageDistance * engageSlack) {
          targetX = foe.x + (dx / distance) * engageDistance
          targetY = foe.y + (dy / distance) * engageDistance
        }
        // Never further from him than its leash, chasing something.
        const fromHimX = targetX - c.x
        const fromHimY = targetY - c.y
        const out = Math.hypot(fromHimX, fromHimY)
        if (out > leash) {
          targetX = c.x + (fromHimX / out) * leash
          targetY = c.y + (fromHimY / out) * leash
        }
        faceX = -dx / distance
        faceY = -dy / distance
      } else {
        companion.mode = 'roam'
        targetX = c.x + companion.roamX
        targetY = c.y + companion.roamY
        if (Math.hypot(targetX - companion.x, targetY - companion.y) < 6) {
          companion.roamWait -= dt
          if (companion.roamWait <= 0) {
            newRoamSpot(world, companion)
            companion.roamWait = roamPause
          }
        }
      }
    }

    const dx = targetX - companion.x
    const dy = targetY - companion.y
    const distance = Math.hypot(dx, dy)
    if (distance > 1e-6) {
      const step = Math.min(distance, speed * pace * dt)
      companion.x += (dx / distance) * step
      companion.y += (dy / distance) * step
      if (!faceX && !faceY) {
        faceX = dx / distance
        faceY = dy / distance
      }
    }
    if (faceX || faceY) {
      companion.facingX = faceX
      companion.facingY = faceY
    }
  }
}
