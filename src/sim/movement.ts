import { config } from '../config'
import { influenceMap } from './influence'
import { pushOutOfObstacles } from './obstacles'
import { characterStat } from './stats'
import type { World } from './world'

/**
 * The character's movement. (spec 3)
 *
 * One rule, applied every frame: fan out a set of candidate directions, score
 * each one by what the influence map says about the ground along it, and steer
 * towards the best.
 *
 * There is deliberately no code here for kiting, fleeing, or collecting. Those
 * are things you will *see*, not things that are written down. If the emergent
 * behaviour looks wrong the fix is in the weights, never a new branch in this
 * file. (spec 3, "why this shape")
 */

export interface MovementDebug {
  /** Chosen heading, for the debug overlay to draw. */
  bestX: number
  bestY: number
  bestScore: number
  /**
   * Score of every candidate direction, in the same order they were tested.
   * The overlay draws these as a fan, which is the quickest way to see
   * *why* he chose what he chose. Reused between frames rather than
   * reallocated 60 times a second.
   */
  scores: number[]
}

export const movementDebug: MovementDebug = { bestX: 1, bestY: 0, bestScore: 0, scores: [] }

export function updateCharacterMovement(world: World, dt: number): void {
  const character = world.character
  const { lookAheadDistances, lookAheadWeights, headingBonus, turnRateRadPerSec } = config.movement
  // Rounded and floored here rather than trusted, because it's tunable live and
  // a fractional value used to crash the next line outright.
  const sampleDirections = Math.max(1, Math.round(config.movement.sampleDirections))

  let bestScore = -Infinity
  let bestIndex = -1
  let bestX = character.facingX
  let bestY = character.facingY

  // Truncate in case the direction count was retuned live.
  movementDebug.scores.length = sampleDirections

  for (let i = 0; i < sampleDirections; i++) {
    const angle = (i / sampleDirections) * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)

    // Several samples along each direction rather than one. A single probe
    // can't tell "clear ahead" from "clear for one step, then a wall of
    // enemies" — and walking into the second one is what makes an AI look
    // stupid rather than unlucky.
    // Weighted rather than a flat average: near probes decide whether he's
    // about to walk into something, far probes only suggest where to head.
    let score = 0
    let totalWeight = 0
    for (let probe = 0; probe < lookAheadDistances.length; probe++) {
      const distance = lookAheadDistances[probe]
      const weight = lookAheadWeights[probe] ?? 1
      score += weight * influenceMap.sample(character.x + dx * distance, character.y + dy * distance)
      totalWeight += weight
    }
    score /= totalWeight || 1

    // A nudge in favour of carrying on the way he's already going. Two
    // near-identical options with no tiebreaker is how an AI ends up
    // vibrating on the spot instead of committing to a route.
    score += headingBonus * (dx * character.facingX + dy * character.facingY)

    movementDebug.scores[i] = score

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
      bestX = dx
      bestY = dy
    }
  }

  // Refine the winner to somewhere between its neighbours. The candidates are
  // 15° apart, so a route at 37° used to be walked as 30°, 45°, 30°, 45° —
  // the winner flipping between the two nearest candidates every few frames,
  // which is most of what read as stutter-stepping. A parabola through the
  // winner and its two neighbours puts the peak where the scores say it is.
  if (bestIndex >= 0 && sampleDirections >= 3) {
    const left = movementDebug.scores[(bestIndex - 1 + sampleDirections) % sampleDirections]
    const right = movementDebug.scores[(bestIndex + 1) % sampleDirections]
    const curvature = left - 2 * bestScore + right
    if (curvature < 0) {
      const offset = Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curvature))
      const angle = ((bestIndex + offset) / sampleDirections) * Math.PI * 2
      bestX = Math.cos(angle)
      bestY = Math.sin(angle)
    }
  }

  movementDebug.bestX = bestX
  movementDebug.bestY = bestY
  movementDebug.bestScore = bestScore

  // Turn towards the choice at a limited rate rather than snapping to it, so
  // a change of mind reads as a curve instead of a teleporting sprite.
  const currentAngle = Math.atan2(character.facingY, character.facingX)
  const targetAngle = Math.atan2(bestY, bestX)

  let delta = targetAngle - currentAngle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2

  const maxTurn = turnRateRadPerSec * dt
  const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, delta))

  character.facingX = Math.cos(newAngle)
  character.facingY = Math.sin(newAngle)

  // Resolved every frame rather than read off the character, so a movement
  // speed upgrade takes effect the moment it's picked.
  const step = characterStat(world, 'moveSpeed', character.speed) * dt
  character.x += character.facingX * step
  character.y += character.facingY * step
  character.stride += step
  // Trees are solid. No sideways slide for him: steering should route him
  // round them, and this only catches the corner he clipped anyway.
  pushOutOfObstacles(world, character, character.radius, 0)
}
