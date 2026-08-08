import type { World } from '../sim/world'
import type { Renderer } from './renderer'

/**
 * Draws the spell flourishes. Placeholder art, but the timing is real — a
 * nova ring that expands and fades over a third of a second reads as an
 * impact, where a static circle reads as a bug.
 */
export function drawEffects(renderer: Renderer, world: World): void {
  for (const effect of world.vfx) {
    const remaining = effect.life / effect.maxLife
    const alpha = Math.max(0, remaining)

    if (effect.kind === 'ring') {
      // Expands as it fades, so the eye reads it as travelling outward.
      const grown = effect.radius * (0.45 + 0.55 * (1 - remaining))
      renderer.strokeWorldCircle(effect.x, effect.y, grown, effect.colour, 2, alpha * 0.85)
      continue
    }

    renderer.strokeWorldLine(effect.x, effect.y, effect.x2, effect.y2, effect.colour, 2, alpha)
  }
}
