import { config } from '../config'
import { makeRng, type Rng } from '../core/rng'
import type { EnemyDef } from '../data/types'

/**
 * All mutable game state, in one object.
 *
 * Nothing lives in module-level variables. That's what makes "he died, start a
 * new run" a matter of calling createWorld() again rather than hunting down
 * every piece of state scattered across the codebase — and death is a real
 * mechanic here, so that restart is coming.
 */

export interface Character {
  x: number
  y: number
  radius: number
  speed: number
  /** Placeholder wander target. Replaced by the danger map in step 2. */
  targetX: number
  targetY: number
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

export interface World {
  /** Seconds since the run started. Every difficulty formula reads this. */
  time: number
  rng: Rng
  character: Character
  enemies: Enemy[]
  /** Fractional spawns carried between frames, so the rate isn't rounded away. */
  spawnCredit: number
  /** Running total of enemies recycled to the far side. Debug readout only. */
  wraps: number
}

export function createWorld(seed: number = config.world.seed): World {
  return {
    time: 0,
    rng: makeRng(seed),
    character: {
      x: 0,
      y: 0,
      radius: config.character.radius,
      speed: config.character.moveSpeed,
      targetX: 0,
      targetY: 0,
    },
    enemies: [],
    spawnCredit: 0,
    wraps: 0,
  }
}
