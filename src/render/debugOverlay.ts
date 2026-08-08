import { config } from '../config'
import { influenceMap } from '../sim/influence'
import { movementDebug } from '../sim/movement'
import { markFreshness } from '../sim/trail'
import type { World } from '../sim/world'
import type { Renderer } from './renderer'

/**
 * Draws what the character is thinking.
 *
 * The influence map is invisible by design, which makes "the movement looks
 * wrong" almost impossible to debug by eye — you can't tell a bad weight from
 * a bad sample distance from a stale map. These overlays make the field and
 * the decision visible, and they are the main tool for the tuning sessions
 * ahead rather than a nicety.
 */

/**
 * The influence field as a heatmap, drawn *relative to where he is standing*.
 *
 * Green means better than here, red means worse than here, and the scale
 * stretches to fit whatever range is currently on screen.
 *
 * It used to draw absolute score against a fixed scale, which was actively
 * misleading. Every cell climbs as globes accumulate and layers stack, so
 * after two minutes the whole screen saturated to flat green — which reads as
 * "everywhere is wonderful" when it actually means "everything is off the top
 * of the scale". Steering only ever compares cells against each other, so
 * differences are the only thing worth showing.
 */
export function drawHeatmap(renderer: Renderer, world: World): void {
  const cell = influenceMap.cellSize
  const here = influenceMap.sample(world.character.x, world.character.y)

  // Auto-scale to the biggest difference in view, floored so a genuinely flat
  // field doesn't get amplified into dramatic-looking noise.
  let widest = 0
  for (let i = 0; i < influenceMap.scores.length; i++) {
    const deviation = Math.abs(influenceMap.scores[i] - here)
    if (deviation > widest) widest = deviation
  }
  const scale = Math.max(config.debug.heatmapMinScale, widest)

  for (let iy = 0; iy < influenceMap.size; iy++) {
    for (let ix = 0; ix < influenceMap.size; ix++) {
      const score = influenceMap.scores[iy * influenceMap.size + ix] - here

      const intensity = Math.min(1, Math.abs(score) / scale)
      if (intensity < 0.02) continue

      renderer.fillWorldRect(
        influenceMap.cellCentreX(ix),
        influenceMap.cellCentreY(iy),
        cell,
        cell,
        score > 0 ? '#3ddc84' : '#ff4d5e',
        intensity * 0.5,
      )
    }
  }
}

/**
 * The breadcrumb trail feeding the staleness layer.
 *
 * Worth drawing separately because on the heatmap his own trail is red, the
 * same as enemies — and "he's avoiding that because he was just there" looks
 * identical to "he's avoiding that because it will kill him" otherwise.
 */
export function drawTrail(renderer: Renderer, world: World): void {
  for (const mark of world.trail) {
    const freshness = markFreshness(world, mark)
    if (freshness <= 0.02) continue
    renderer.fillWorldRect(mark.x, mark.y, 5, 5, '#ff9ecb', freshness * 0.8)
  }
}

/**
 * The fan of candidate directions, each drawn at a length proportional to how
 * good it scored, with the chosen one highlighted. This is the quickest way to
 * see *why* he went where he went.
 */
export function drawCandidates(renderer: Renderer, world: World): void {
  const scores = movementDebug.scores
  if (scores.length === 0) return

  const { x, y } = world.character

  let lowest = Infinity
  let highest = -Infinity
  for (const score of scores) {
    if (score < lowest) lowest = score
    if (score > highest) highest = score
  }
  const span = highest - lowest || 1

  const minLength = 25
  const maxLength = 140

  for (let i = 0; i < scores.length; i++) {
    const angle = (i / scores.length) * Math.PI * 2
    const normalised = (scores[i] - lowest) / span
    const length = minLength + normalised * (maxLength - minLength)

    renderer.strokeWorldLine(
      x,
      y,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
      '#6fa8dc',
      1,
      0.25 + normalised * 0.45,
    )
  }

  renderer.strokeWorldLine(
    x,
    y,
    x + movementDebug.bestX * maxLength,
    y + movementDebug.bestY * maxLength,
    '#ffe066',
    2,
    0.95,
  )
}
