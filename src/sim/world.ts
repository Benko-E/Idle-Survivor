import { config } from '../config'
import { makeRng, type Rng } from '../core/rng'
import type { EnemyDef } from '../data/types'

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
}

export interface Pickup {
  x: number
  y: number
}

export interface World {
  /** Seconds since the run started. Every difficulty formula reads this. */
  time: number
  state: RunState
  rng: Rng

  character: Character
  enemies: Enemy[]
  pickups: Pickup[]

  /** Fractional spawns carried between frames, so rates aren't rounded away. */
  spawnCredit: number
  pickupCredit: number

  /** Debug readouts. */
  wraps: number
  pickupsCollected: number
  incomingDps: number
}

export function createWorld(seed: number = config.world.seed): World {
  return {
    time: 0,
    state: 'running',
    rng: makeRng(seed),
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
    spawnCredit: 0,
    pickupCredit: 0,
    wraps: 0,
    pickupsCollected: 0,
    incomingDps: 0,
  }
}
