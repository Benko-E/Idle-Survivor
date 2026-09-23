import { config } from '../config'
import { orbitPositions } from '../sim/orbit'
import { weaponStat } from '../sim/stats'
import type { World } from '../sim/world'
import type { Renderer } from './renderer'
import { getSheet, type SpriteSheet } from './sprites'

/**
 * Draws the spell flourishes. Placeholder art, but the timing is real — a
 * nova ring that expands and fades over a third of a second reads as an
 * impact, where a static circle reads as a bug.
 *
 * Everything here is scaled by `render.effectsAlpha`, the one knob for "this
 * has turned into a light show" — at 0.5 every effect is half as loud, and
 * the spells underneath carry on unchanged.
 */
/**
 * What lies flat on the ground: zone floors, warning circles, the aura's glow,
 * rings at rooted feet. Drawn before the scene, so enemies stand on top of a
 * blizzard's ice instead of disappearing under it.
 */
export function drawGroundEffects(renderer: Renderer, world: World): void {
  const loudness = config.render.effectsAlpha
  if (loudness <= 0) return
  drawAuras(renderer, world, loudness, true)
  drawZones(renderer, world, loudness, true)
  drawRoots(renderer, world, loudness)
}

/** Everything standing up or in the air, drawn after the scene. */
export function drawEffects(renderer: Renderer, world: World): void {
  const loudness = config.render.effectsAlpha
  if (loudness <= 0) return

  drawAuras(renderer, world, loudness, false)
  drawZones(renderer, world, loudness, false)
  drawProjectiles(renderer, world, loudness)
  drawOrbits(renderer, world, loudness)

  for (const effect of world.vfx) {
    const remaining = effect.life / effect.maxLife
    const alpha = Math.max(0, remaining) * loudness

    if (effect.kind === 'sprite') {
      drawSpriteEffect(renderer, effect, 1 - remaining, loudness)
      continue
    }

    if (effect.kind === 'line' && effect.art) {
      const sheet = getSheet(`fx:${effect.art}`)
      if (sheet) {
        const frame = Math.floor((1 - remaining) * sheet.frames) % sheet.frames
        renderer.drawWorldBeam(sheet, frame, effect.x, effect.y, effect.x2, effect.y2, 14, FLIGHT_HEIGHT, Math.min(1, alpha * 1.5))
        continue
      }
    }

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
 * A one-shot animation: an explosion, a strike, a hit flash. Played through
 * once over its life. Grounded ones stand on their point; the rest are
 * centred on it at hit height.
 */
function drawSpriteEffect(renderer: Renderer, effect: { x: number; y: number; art?: string; width?: number; grounded?: boolean }, progress: number, loudness: number): void {
  const sheet = effect.art ? getSheet(`fx:${effect.art}`) : undefined
  if (!sheet) return
  const frame = Math.min(sheet.frames - 1, Math.floor(progress * sheet.frames))
  const w = effect.width ?? 24
  const h = w / sheet.aspect
  renderer.drawWorldSprite(sheet, frame, effect.x, effect.y, effect.grounded ? h / 2 : FLIGHT_HEIGHT, w, h, loudness)
}

/**
 * A steady glow for as long as he has the aura, sized from its live stats so
 * an area upgrade is visible the moment it's taken.
 */
function drawAuras(renderer: Renderer, world: World, loudness: number, ground: boolean): void {
  if (world.state !== 'running') return
  const { x, y } = world.character
  for (const weapon of world.weapons) {
    if (weapon.def.behaviour !== 'aura' || !weapon.def.enabled) continue
    const radius = weaponStat(world, weapon, 'area')
    // A slow breath rather than a flicker, so it reads as alive, not busy.
    const breathe = 0.85 + 0.15 * Math.sin(world.time * 3)
    const flames = weapon.def.fx?.flames ? getSheet(`fx:${weapon.def.fx.flames}`) : undefined
    if (ground) {
      renderer.fillWorldCircle(x, y, radius, weapon.def.colour, 0.1 * breathe * loudness)
      if (!flames) renderer.strokeWorldCircle(x, y, radius, weapon.def.colour, 1.5, 0.35 * breathe * loudness)
      continue
    }
    if (!flames) continue
    // Flames stood round the edge, slowly turning, each on its own frame so
    // they flicker out of step.
    const count = Math.max(6, Math.round(radius / 12))
    const h = 26
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + world.time * 0.4
      const frame = (Math.floor(world.time * 9) + i) % flames.frames
      renderer.drawWorldSprite(flames, frame, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, h / 2, h * flames.aspect, h, 0.9 * loudness)
    }
  }
}

/**
 * Snow falling inside a circle. Each flake's path comes from its index, so
 * it needs no state and costs nothing to keep: flake i starts at a fixed
 * spot in the circle and falls on a loop.
 */
function drawSnow(renderer: Renderer, x: number, y: number, radius: number, time: number, alpha: number): void {
  const flakes = 22
  for (let i = 0; i < flakes; i++) {
    const angle = i * 2.399963
    const spread = Math.sqrt((i + 0.5) / flakes) * radius
    const fall = (time * 0.7 + i * 0.137) % 1
    renderer.drawWorldOrb(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, 1.6, 60 * (1 - fall), '#ffffff', alpha * Math.min(1, fall * 4))
  }
}

/**
 * Pieces falling into a zone and breaking on the ground — Blizzard's ice.
 * Each piece's spot and timing come from its index, like the snow, so there
 * is nothing to store. The strip is one fall from top to shatter.
 */
function drawFalling(renderer: Renderer, sheet: SpriteSheet, x: number, y: number, radius: number, time: number, alpha: number): void {
  const pieces = Math.max(5, Math.round(radius / 18))
  const h = 34
  for (let i = 0; i < pieces; i++) {
    const cycle = (time * 1.4 + i * 0.37) % 1
    // A new spot each time round, so the ice doesn't fall in the same holes.
    const round = Math.floor(time * 1.4 + i * 0.37)
    const angle = (i * 2.399963 + round * 1.7) % (Math.PI * 2)
    const spread = Math.sqrt(((i * 7 + round * 3) % pieces + 0.5) / pieces) * radius * 0.9
    const frame = Math.min(sheet.frames - 1, Math.floor(cycle * sheet.frames))
    renderer.drawWorldSprite(sheet, frame, x + Math.cos(angle) * spread, y + Math.sin(angle) * spread * 0.9, h / 2, h * sheet.aspect, h, alpha)
  }
}

/**
 * Zones in two passes: `ground` draws what lies flat — floors, warnings,
 * rings — and the other pass what stands above them: a falling meteor,
 * falling ice, the storm cloud.
 */
function drawZones(renderer: Renderer, world: World, loudness: number, ground: boolean): void {
  for (const zone of world.zones) {
    const fx = zone.source.def.fx
    if (!zone.landed) {
      // The warning: an outline where it will land, with a fill that grows in
      // from the centre as the moment approaches.
      const progress = zone.delayTotal > 0 ? 1 - zone.delay / zone.delayTotal : 1
      if (ground) {
        renderer.strokeWorldCircle(zone.x, zone.y, zone.radius, zone.colour, 1, 0.45 * loudness)
        renderer.fillWorldCircle(zone.x, zone.y, zone.radius * progress, zone.colour, 0.14 * loudness)
        continue
      }
      const falling = fx?.fall ? getSheet(`fx:${fx.fall}`) : undefined
      if (falling) {
        // Coming in from high up and to the right, landing as the warning fills.
        const w = zone.radius * 1.3
        const h = w / falling.aspect
        const frame = Math.floor(world.time * 12) % falling.frames
        const fromX = zone.x + 150 * (1 - progress)
        const lift = 260 * (1 - progress) + h * 0.3
        renderer.drawWorldSprite(falling, frame, fromX + w * 0.3, zone.y, lift, w, h, loudness)
      }
      continue
    }

    // Active: a faint floor, plus whatever the zone does drawn on top.
    const life = zone.durationTotal > 0 ? zone.remaining / zone.durationTotal : 0
    const fade = Math.min(1, life * 4)
    if (!ground) {
      const particle = fx?.particle ? getSheet(`fx:${fx.particle}`) : undefined
      if (particle) drawFalling(renderer, particle, zone.x, zone.y, zone.radius, world.time, fade * loudness)
      else if (zone.slow > 0) drawSnow(renderer, zone.x, zone.y, zone.radius, world.time, 0.8 * fade * loudness)
      const cloud = fx?.cloud ? getSheet(`fx:${fx.cloud}`) : undefined
      if (cloud) {
        // Smaller than the zone and a little see-through: it marks where the
        // storm is without hiding the fight underneath, or him.
        const w = zone.radius * 1.5
        const frame = Math.floor(world.time * 4) % cloud.frames
        renderer.drawWorldSprite(cloud, frame, zone.x, zone.y, 95, w, w / cloud.aspect, 0.72 * fade * loudness)
      }
      continue
    }
    if (zone.strikeRate > 0) {
      // A storm casts a shadow: the ground under the cloud goes dark.
      renderer.fillWorldCircle(zone.x, zone.y, zone.radius, '#1b2030', 0.35 * fade * loudness)
    }
    const floor = fx?.ground ? getSheet(`fx:${fx.ground}`) : undefined
    if (floor) {
      // Laid flat to fill the zone's circle as the ground sees it.
      const w = zone.radius * 2.2
      renderer.drawWorldSprite(floor, 0, zone.x, zone.y, 0, w, w * config.render.yScale, 0.85 * fade * loudness)
    } else {
      renderer.fillWorldCircle(zone.x, zone.y, zone.radius, zone.colour, 0.12 * fade * loudness)
    }
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

/** How high off the ground bolts and orbs fly, in world units: about hand height. */
const FLIGHT_HEIGHT = 16

/** Orb art by element. Anything without art is drawn as a glowing ball. */
const ORB_ART: Record<string, string> = { fire: 'orb_fire', frost: 'orb_ice' }

/**
 * Bolts in flight: the elemental orb sprites where there are some, a glow for
 * the rest. Sized from the bolt's own radius, so Frozen Orb is a big ball.
 */
function drawProjectiles(renderer: Renderer, world: World, loudness: number): void {
  for (let i = 0; i < world.projectiles.length; i++) {
    const projectile = world.projectiles[i]
    const element = projectile.tags.find((tag) => tag in ORB_ART)
    const sheet = element ? getSheet(ORB_ART[element]) : undefined
    if (!sheet) {
      renderer.drawWorldOrb(projectile.x, projectile.y, projectile.radius, FLIGHT_HEIGHT, projectile.colour, loudness)
      continue
    }
    const h = Math.max(14, projectile.radius * 3.4)
    const frame = Math.floor(world.time * 10 + i) % 4
    renderer.drawWorldSprite(sheet, frame, projectile.x, projectile.y, FLIGHT_HEIGHT, h * sheet.aspect, h, loudness)
  }
}

/** Ball Lightning's orbs, from the same clock the damage uses. */
function drawOrbits(renderer: Renderer, world: World, loudness: number): void {
  if (world.state !== 'running') return
  for (const weapon of world.weapons) {
    if (weapon.def.behaviour !== 'orbit' || !weapon.def.enabled) continue
    const size = weaponStat(world, weapon, 'size')
    // A faint track, so the orbit reads as one thing rather than loose sparks.
    renderer.strokeWorldCircle(world.character.x, world.character.y, weaponStat(world, weapon, 'area'), weapon.def.colour, 1, 0.12 * loudness)
    const art = weapon.def.fx?.orb ? getSheet(`fx:${weapon.def.fx.orb}`) : undefined
    let index = 0
    for (const orb of orbitPositions(world, weapon)) {
      if (art) {
        const w = size * 3
        const frame = (Math.floor(world.time * 12) + index++) % art.frames
        renderer.drawWorldSprite(art, frame, orb.x, orb.y, FLIGHT_HEIGHT, w, w / art.aspect, loudness)
        continue
      }
      // A flicker, because it's lightning.
      const flicker = 0.8 + 0.2 * Math.sin(world.time * 40 + orb.x)
      renderer.drawWorldOrb(orb.x, orb.y, size, FLIGHT_HEIGHT, weapon.def.colour, loudness * flicker)
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
