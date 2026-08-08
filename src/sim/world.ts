import { config } from '../config'
import type { Modifier } from '../core/modifiers'
import { makeRng, type Rng } from '../core/rng'
import { findWeaponDef } from '../data/weapons'
import type { EnemyDef, PickupDef, WeaponDef } from '../data/types'
import type { Projectile } from './projectiles'
import type { StatusEffect } from './statusEffects'
import type { VisitMark } from './trail'
import type { Vfx } from './vfx'

/**
 * All mutable game state, in one object.
 *
 * Nothing lives in module-level variables. That's what makes "he died, start a
 * new run" a matter of calling createWorld() again rather than hunting down
 * every piece of state scattered across the codebase.
 */

export type RunState = 'running' | 'dead'

export interface Character {
  x: number
  y: number
  radius: number
  speed: number
  hp: number
  maxHp: number
  /** Unit vector. Movement steers this rather than setting it outright. */
  facingX: number
  facingY: number
}

export interface Enemy {
  /** Stable per-instance handle, so a projectile can remember what it hit. */
  id: number
  /**
   * A reference to the shared definition, not a copy of it. Static properties
   * (colour, size, display name) are read straight off the def; only values
   * that vary per instance live on the enemy itself.
   */
  def: EnemyDef
  x: number
  y: number
  hp: number
  maxHp: number
  /** Resolved at spawn from the def's base speed and the difficulty curve. */
  speed: number
  effects: StatusEffect[]
}

export interface Pickup {
  def: PickupDef
  /**
   * Magnitude. Everything it's worth and how loudly it calls to the character
   * is a formula over this number — see sim/pickupTiers.ts.
   */
  tier: number
  x: number
  y: number
  /** Came within near-miss distance at some point. Measurement only. */
  wasNear: boolean
}

export interface WeaponInstance {
  def: WeaponDef
  cooldownRemaining: number
  timesCast: number
}

export interface World {
  /** Seconds since the run started. Every difficulty formula reads this. */
  time: number
  state: RunState
  rng: Rng

  character: Character
  enemies: Enemy[]
  pickups: Pickup[]
  projectiles: Projectile[]
  vfx: Vfx[]
  /** Where he's recently been. Oldest first. */
  trail: VisitMark[]
  lastMarkX: number
  lastMarkY: number
  /**
   * Dwell time per patch of ground, keyed by packed cell coordinates. On the
   * world rather than at module level so restarting a run clears it for free.
   */
  occupancy: Map<number, { amount: number; updated: number }>

  weapons: WeaponInstance[]
  /**
   * Every stat change in play, from upgrades. Empty until the draft exists in
   * step 6 — but every spell already reads its numbers through it.
   */
  modifiers: Modifier[]

  /** Total XP banked this run. The level curve arrives in step 5. */
  xp: number

  /**
   * TEMPORARY. Value collected since his last shop visit, and where the shop
   * is. Stands in for gold until there is such a thing. See config.shop.
   */
  carried: number
  shopX: number
  shopY: number
  shopVisits: number
  spentAtShop: number

  /** Fractional spawns carried between frames, so rates aren't rounded away. */
  spawnCredit: number
  /** Throttle clock for the globe merge pass. */
  mergeCredit: number
  nextEnemyId: number

  /** Debug readouts. */
  wraps: number
  pickupsCollected: number
  /** Globes he came within reach of and left behind. */
  pickupsMissed: number
  incomingDps: number
  kills: number
  damageDealt: number
}

export function createWorld(seed: number = config.world.seed): World {
  const rng = makeRng(seed)

  // Somewhere out there, at a random bearing. Far enough that reaching it is
  // a journey rather than a detour.
  const shopAngle = rng() * Math.PI * 2

  return {
    time: 0,
    state: 'running',
    rng,
    character: {
      x: 0,
      y: 0,
      radius: config.character.radius,
      speed: config.character.moveSpeed,
      hp: config.character.maxHp,
      maxHp: config.character.maxHp,
      facingX: 1,
      facingY: 0,
    },
    enemies: [],
    pickups: [],
    projectiles: [],
    vfx: [],
    trail: [],
    lastMarkX: 0,
    lastMarkY: 0,
    occupancy: new Map(),
    weapons: config.character.startingWeaponIds.map((id) => ({
      def: findWeaponDef(id),
      // Staggered rather than all firing on frame one, which otherwise puts
      // every cooldown permanently in lockstep.
      cooldownRemaining: 0.15,
      timesCast: 0,
    })),
    modifiers: [],
    xp: 0,
    carried: 0,
    shopX: Math.cos(shopAngle) * config.shop.distanceFromStart,
    shopY: Math.sin(shopAngle) * config.shop.distanceFromStart,
    shopVisits: 0,
    spentAtShop: 0,
    spawnCredit: 0,
    mergeCredit: 0,
    nextEnemyId: 1,
    wraps: 0,
    pickupsCollected: 0,
    pickupsMissed: 0,
    incomingDps: 0,
    kills: 0,
    damageDealt: 0,
  }
}
