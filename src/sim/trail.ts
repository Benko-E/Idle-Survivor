import { config } from '../config'
import type { World } from './world'

/**
 * A trail of breadcrumbs marking where he has recently been.
 *
 * Feeds the staleness layer in the influence map. Each mark repels a little
 * and fades over `memorySeconds`, so ground he has just walked over is briefly
 * unattractive and then recovers — which matters, because new globes keep
 * dropping and old ground genuinely does become worth revisiting.
 *
 * Marks are dropped by distance travelled rather than by time. Dropping them
 * on a timer would mean standing still piles hundreds of marks on one spot and
 * blasts him out of it like a landmine; by distance, a stationary character
 * lays exactly one, and it is the *overlap* from circling that accumulates.
 */

export interface VisitMark {
  x: number
  y: number
  /** World time it was laid, so freshness is a subtraction rather than a tick. */
  time: number
}

export function updateTrail(world: World): void {
  const { spacing, memorySeconds, maxMarks } = config.trail
  const { x, y } = world.character

  const dx = x - world.lastMarkX
  const dy = y - world.lastMarkY

  if (dx * dx + dy * dy >= spacing * spacing) {
    world.trail.push({ x, y, time: world.time })
    world.lastMarkX = x
    world.lastMarkY = y
  }

  // Oldest first, so expiring from the front is enough.
  const cutoff = world.time - memorySeconds
  let expired = 0
  while (expired < world.trail.length && world.trail[expired].time < cutoff) expired++
  if (expired > 0) world.trail.splice(0, expired)

  if (world.trail.length > maxMarks) {
    world.trail.splice(0, world.trail.length - maxMarks)
  }
}

/** 1 when just laid, 0 when fully faded. */
export function markFreshness(world: World, mark: VisitMark): number {
  const age = world.time - mark.time
  return Math.max(0, 1 - age / config.trail.memorySeconds)
}
