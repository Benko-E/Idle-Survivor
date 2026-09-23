import { config } from '../config'
import { weaponStat } from '../sim/stats'
import type { World } from '../sim/world'
import type { Renderer } from './renderer'

/**
 * Draws the spell flourishes. Placeholder art, but the timing is real — a
 * nova ring that expands and fades over a third of a second reads as an
 * impact, where a static circle reads as a bug.
 *
 * Everything here is scaled by `render.effectsAlpha`, the one knob for "this
 * has turned into a light show" — at 0.5 every effect is half as loud, and
 * the spells underneath carry on unchanged.
 */
export function drawEffects(renderer: Renderer, world: World): void {
  const loudness = config.render.effectsAlpha
  if (loudness <= 0) return

  drawAuras(renderer, world, loudness)
  drawZones(renderer, world, loudness)
  drawRoots(renderer, world, loudness)

  for (const effect of world.vfx) {
    const remaining = effect.life / effect.maxLife
    const alpha = Math.max(0, remaining) * loudness

    if (effect.kind === 'ring') {
      // Expands as it fades, so the eye reads it as travelling outward.
      const grown = effect.radius * (0.45 + 0.55 * (1 - remaining))
      renderer.strokeWorldCircle(effect.x, effect.y, grown, effect.colour, 2, alpha * 0.85)
      continue
    }

    renderer.strokeWorldLine(effect.x, effect.y, effect.x2, effect.y2, effect.colour, 3, alpha)
  }
}

/**
 * A steady glow for as long as he has the aura, sized from its live stats so
 * an area upgrade is visible the moment it's taken.
 */
function drawAuras(renderer: Renderer, world: World, loudness: number): void {
  if (world.state !== 'running') return
  const { x, y } = world.character
  for (const weapon of world.weapons) {
    if (weapon.def.behaviour !== 'aura' || !weapon.def.enabled) continue
    const radius = weaponStat(world, weapon, 'area')
    // A slow breath rather than a flicker, so it reads as alive, not busy.
    const breathe = 0.85 + 0.15 * Math.sin(world.time * 3)
    renderer.fillWorldCircle(x, y, radius, weapon.def.colour, 0.1 * breathe * loudness)
    renderer.strokeWorldCircle(x, y, radius, weapon.def.colour, 1.5, 0.35 * breathe * loudness)
  }
}

function drawZones(renderer: Renderer, world: World, loudness: number): void {
  for (const zone of world.zones) {
    if (!zone.landed) {
      // The warning: an outline where it will land, with a fill that grows in
      // from the centre as the moment approaches.
      const progress = zone.delayTotal > 0 ? 1 - zone.delay / zone.delayTotal : 1
      renderer.strokeWorldCircle(zone.x, zone.y, zone.radius, zone.colour, 1, 0.45 * loudness)
      renderer.fillWorldCircle(zone.x, zone.y, zone.radius * progress, zone.colour, 0.14 * loudness)
      continue
    }

    // Active: a faint floor, plus rings that shrink inwards if it pulls.
    const life = zone.durationTotal > 0 ? zone.remaining / zone.durationTotal : 0
    const fade = Math.min(1, life * 4)
    renderer.fillWorldCircle(zone.x, zone.y, zone.radius, zone.colour, 0.12 * fade * loudness)
    if (zone.pull > 0) {
      for (let ring = 0; ring < 3; ring++) {
        const phase = (world.time * 0.9 + ring / 3) % 1
        renderer.strokeWorldCircle(zone.x, zone.y, zone.radius * (1 - phase), zone.colour, 1.5, 0.5 * phase * fade * loudness)
      }
    } else {
      renderer.strokeWorldCircle(zone.x, zone.y, zone.radius, zone.colour, 1.5, 0.35 * fade * loudness)
    }
  }
}

/** A small ring at the feet of anything rooted, so it's clear why it stopped. */
function drawRoots(renderer: Renderer, world: World, loudness: number): void {
  for (const enemy of world.enemies) {
    for (const effect of enemy.effects) {
      if (effect.kind !== 'root') continue
      const colour = effect.source?.def.colour ?? '#6fcf5a'
      renderer.strokeWorldCircle(enemy.x, enemy.y, enemy.def.radius + 4, colour, 2, 0.8 * loudness)
      break
    }
  }
}
