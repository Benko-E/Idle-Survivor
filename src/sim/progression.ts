import { config } from '../config'
import type { World } from './world'

/**
 * Experience and levels. (spec 4, spec 5.3)
 *
 * XP is never picked up. It's awarded automatically for every kill, which
 * keeps progression separate from the economy — gold is the thing that drops,
 * gets carried and gets spent, and the two can be tuned without touching each
 * other.
 *
 * The curve is a formula over the level number, never a table. Changing the
 * shape means changing two constants and every level moves at once.
 */

/** XP needed to get from `level` to the next one. */
export function xpForLevel(level: number): number {
  const { baseXp, exponent } = config.progression
  return Math.max(1, Math.round(baseXp * Math.pow(level, exponent)))
}

/**
 * Award XP and roll up as many levels as it covers.
 *
 * Levels are banked as `pendingLevelUps` rather than acted on. Nothing
 * consumes them yet — step 6's draft will, one at a time, pausing for each.
 * A single big kill crossing two thresholds should offer two choices, not
 * silently swallow one.
 */
export function grantXp(world: World, amount: number): void {
  if (amount <= 0) return

  world.xp += amount
  world.xpIntoLevel += amount

  let guard = 0
  while (world.xpIntoLevel >= xpForLevel(world.level) && guard++ < 100) {
    world.xpIntoLevel -= xpForLevel(world.level)
    world.level++
    world.pendingLevelUps++
  }
}

/** How far through the current level he is, 0..1. For the bar. */
export function levelProgress(world: World): number {
  return Math.min(1, world.xpIntoLevel / xpForLevel(world.level))
}
