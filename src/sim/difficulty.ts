import { config } from '../config'

/**
 * Everything that changes as a run gets longer. (spec 5.3)
 *
 * All of it is a function of elapsed time driven by constants in the config —
 * never a table of per-minute values. Changing the shape of the ramp means
 * changing a couple of numbers, and every point on the curve moves at once.
 *
 * These are linear because linear is the simplest thing that works, and the
 * spec says the difficulty ramp will be iterated on heavily (spec 7). When it
 * needs a knee or a plateau, it changes here and nowhere else.
 */

/** How many enemies should be spawning per second, `seconds` into the run. */
export function spawnsPerSecond(seconds: number): number {
  const { baseSpawnsPerSecond, spawnGrowthPerMinute, maxSpawnsPerSecond } = config.difficulty
  const minutes = seconds / 60
  return Math.min(maxSpawnsPerSecond, baseSpawnsPerSecond + spawnGrowthPerMinute * minutes)
}

/** Multiplier applied to an enemy's base HP at the moment it spawns. */
export function hpMultiplier(seconds: number): number {
  return 1 + config.difficulty.hpGrowthPerMinute * (seconds / 60)
}

/**
 * Multiplier applied to an enemy's base speed at spawn.
 *
 * Capped, and capped low. If enemies ever outrun the character the movement AI
 * has no options left and the danger map stops meaning anything.
 */
export function speedMultiplier(seconds: number): number {
  const { speedGrowthPerMinute, maxSpeedMultiplier } = config.difficulty
  return Math.min(maxSpeedMultiplier, 1 + speedGrowthPerMinute * (seconds / 60))
}
