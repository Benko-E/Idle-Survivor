import { config } from '../config'
import { auraRadius, isAura, pyreLit } from '../sim/auras'
import { allWeapons, type Summon } from '../sim/summons'
import { orbitPositions } from '../sim/orbit'
import { weaponStat } from '../sim/stats'
import { casterOf, type WeaponInstance, type World } from '../sim/world'
import type { Zone } from '../sim/zones'
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
  drawSummons(renderer, world, loudness, true)
  drawZealotry(renderer, world, loudness)
  drawHotStreakReady(renderer, world, loudness)
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
  drawSummons(renderer, world, loudness, false)

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
  for (const weapon of allWeapons(world)) {
    if (!isAura(weapon) || !weapon.def.enabled) continue
    // Round whoever casts it: him, or a summon.
    const { x, y } = casterOf(world, weapon)
    const radius = auraRadius(world, weapon)
    const { colour, shift } = auraColour(world, weapon)
    const lit = pyreLit(world, weapon)
    // A slow breath rather than a flicker, so it reads as alive, not busy.
    // With Zealot's Pyre lit it burns brighter and breathes faster.
    const breathe = 0.85 + 0.15 * Math.sin(world.time * (lit ? 6 : 3))
    const glow = lit ? 1.7 : 1
    const flames = weapon.def.fx?.flames ? getSheet(`fx:${weapon.def.fx.flames}`) : undefined
    if (ground) {
      renderer.fillWorldCircle(x, y, radius, colour, 0.1 * glow * breathe * loudness)
      // The edge as one unbroken line of fire, so the flames stood on it
      // read as a ring rather than a scatter of campfires.
      renderer.strokeWorldCircle(x, y, radius, colour, lit ? 3 : 2, 0.55 * glow * breathe * loudness)
      continue
    }
    if (!flames) continue
    // Small flames all the way round, close together, slowly turning, each on
    // its own frame so they flicker out of step.
    const h = 13
    const count = Math.max(12, Math.round((Math.PI * 2 * radius) / (h * 0.75)))
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + world.time * 0.4
      const frame = (Math.floor(world.time * 9) + i) % flames.frames
      // Martyr's Fervour turns the flames themselves towards red; a lit
      // pyre washes them whiter, burning brighter.
      const tint = shift > 0 ? colour : lit ? '#fff4d6' : undefined
      const tintAmount = shift > 0 ? 0.75 * shift : lit ? 0.3 : 0
      renderer.drawWorldSprite(flames, frame, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, h / 2, h * flames.aspect, h, 0.9 * loudness, tint, tintAmount)
    }
  }
}

/**
 * An aura's colour: its own, turning towards deep red as he's hurt when
 * Martyr's Fervour is making it burn hotter for it — fully red at the point
 * Zealot's Pyre goes out.
 */
function auraColour(world: World, weapon: WeaponInstance): { colour: string; shift: number } {
  const base = weapon.def.colour
  if (weaponStat(world, weapon, 'fervour') <= 0) return { colour: base, shift: 0 }
  const c = world.character
  const health = c.hp / Math.max(1, c.maxHp)
  const shift = Math.max(0, Math.min(1, (1 - health) / (1 - config.aura.pyreOffAt)))
  return { colour: mixColour(base, '#d10f0f', shift), shift }
}

function mixColour(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const channel = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t)
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}

/** Zealotry: a flickering little ring of holy fire round everything carrying one. */
function drawZealotry(renderer: Renderer, world: World, loudness: number): void {
  for (const enemy of world.enemies) {
    if (!enemy.effects.some((effect) => effect.condition === 'zealotry')) continue
    const flicker = 0.7 + 0.3 * Math.sin(world.time * 14 + enemy.id)
    renderer.strokeWorldCircle(enemy.x, enemy.y, enemy.def.radius * config.aura.zealotryReach, '#ffcf4a', 1.5, 0.8 * flicker * loudness)
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

    if (zone.wall) {
      drawWall(renderer, world, zone, loudness, ground)
      continue
    }

    // Active: a faint floor, plus whatever the zone does drawn on top.
    const life = zone.durationTotal > 0 ? zone.remaining / zone.durationTotal : 0
    const fade = Math.min(1, life * 4)
    // A patch of a trail is a small flame standing on it, shrinking and
    // fading as it burns out, over a faint glow.
    if (zone.quiet) {
      if (ground) {
        renderer.fillWorldCircle(zone.x, zone.y, zone.radius * 0.8, zone.colour, 0.18 * life * loudness)
        continue
      }
      const flame = fx?.flames ? getSheet(`fx:${fx.flames}`) : undefined
      if (!flame) continue
      const h = 12 + 10 * life
      const frame = (Math.floor(world.time * 10) + Math.round(zone.x + zone.y)) % flame.frames
      renderer.drawWorldSprite(flame, frame, zone.x, zone.y, h / 2, h * flame.aspect, h, 0.9 * Math.min(1, life * 2) * loudness)
      continue
    }
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

/**
 * Summons, until they have art. An 'orb' is a glowing ball floating about
 * hand height, bobbing on its own rhythm, over a soft glow on the ground; a
 * 'none' is only its spells (a fire on the grass is just its ring). A body
 * is its `bodyArt` stretched from segment to segment, crackling. One with a
 * lifetime fades out over its last half second.
 */
function drawSummons(renderer: Renderer, world: World, loudness: number, ground: boolean): void {
  for (const summoned of world.summons) drawSummon(renderer, world, summoned, loudness, ground)
}

function drawSummon(renderer: Renderer, world: World, summoned: Summon, loudness: number, ground: boolean): void {
  const { x, y, def, age } = summoned
  const fade = Math.min(1, summoned.remaining / 0.5) * loudness
  const lift = summoned.body ? FLIGHT_HEIGHT : 22 + Math.sin(age * 3) * 3
  if (ground) {
    if (def.look === 'orb') renderer.fillWorldCircle(x, y, def.radius * 1.8, def.colour, 0.22 * fade)
    return
  }
  const body = summoned.body
  const art = def.bodyArt ? getSheet(`fx:${def.bodyArt}`) : undefined
  if (body) {
    for (let i = 1; i < body.length; i++) {
      const a = body[i - 1]
      const b = body[i]
      // Thinner towards the tail.
      const thickness = 14 * (1 - (i / body.length) * 0.6)
      if (art) renderer.drawWorldBeam(art, (Math.floor(world.time * 14) + i) % art.frames, a.x, a.y, b.x, b.y, thickness, lift, fade)
      else renderer.strokeWorldLine(a.x, a.y, b.x, b.y, def.colour, 3, fade)
    }
  }
  if (def.look === 'orb') {
    const pulse = 1 + Math.sin(age * 7) * 0.08
    renderer.drawWorldOrb(x, y, def.radius * pulse, lift, def.colour, fade)
  }
}

/** Firewall's flames lean orange, so they don't read as Righteous Fire's. */
const WALL_TINT = '#ff7a2a'

/**
 * A wall of fire: a glowing strip — or ring — on the ground, and a close row
 * of tall flames standing on it. They rise when it goes up and sink as it
 * burns out, so its last moment can be seen coming.
 */
function drawWall(renderer: Renderer, world: World, zone: Zone, loudness: number, ground: boolean): void {
  const wall = zone.wall!
  const rise = Math.min(1, (world.time - wall.bornAt) / 0.3)
  const strength = rise * Math.min(1, zone.remaining / 0.6)
  if (strength <= 0) return
  if (ground) {
    const flicker = (0.85 + 0.15 * Math.sin(world.time * 7 + zone.x * 0.01)) * strength * loudness
    if (wall.kind === 'ring') {
      renderer.fillWorldAnnulus(zone.x, zone.y, zone.radius, wall.halfWidth, zone.colour, 0.24 * flicker)
      renderer.fillWorldAnnulus(zone.x, zone.y, zone.radius, wall.halfWidth * 0.4, '#fff1c2', 0.2 * flicker)
      return
    }
    const ex = wall.dirX * wall.halfLength
    const ey = wall.dirY * wall.halfLength
    renderer.fillWorldBand(zone.x - ex, zone.y - ey, zone.x + ex, zone.y + ey, wall.halfWidth, zone.colour, 0.24 * flicker)
    renderer.fillWorldBand(zone.x - ex, zone.y - ey, zone.x + ex, zone.y + ey, wall.halfWidth * 0.4, '#fff1c2', 0.2 * flicker)
    return
  }
  const flames = zone.source.def.fx?.flames ? getSheet(`fx:${zone.source.def.fx.flames}`) : undefined
  if (!flames) return
  // Close together, each on its own frame and a little taller or shorter
  // than its neighbours, drawn back to front so the near ones stand in front.
  const spacing = 10
  const spots: { x: number; y: number; i: number }[] = []
  if (wall.kind === 'ring') {
    const count = Math.max(16, Math.round((Math.PI * 2 * zone.radius) / spacing))
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      spots.push({ x: zone.x + Math.cos(angle) * zone.radius, y: zone.y + Math.sin(angle) * zone.radius, i })
    }
  } else {
    const count = Math.max(2, Math.round((wall.halfLength * 2) / spacing) + 1)
    for (let i = 0; i < count; i++) {
      const t = -wall.halfLength + (i / (count - 1)) * wall.halfLength * 2
      spots.push({ x: zone.x + wall.dirX * t, y: zone.y + wall.dirY * t, i })
    }
  }
  spots.sort((a, b) => a.y - b.y)
  const alpha = 0.92 * strength * loudness
  for (const spot of spots) {
    const h = 26 * (0.35 + 0.65 * strength) * (0.8 + 0.4 * (((spot.i * 37) % 11) / 10))
    const frame = (Math.floor(world.time * 10) + spot.i * 3) % flames.frames
    renderer.drawWorldSprite(flames, frame, spot.x, spot.y, h / 2, h * flames.aspect, h, alpha, WALL_TINT, 0.35)
  }
}

/**
 * Hot Streak's tell: when his next bolt will be the big one, the ground at
 * his feet glows, so it can be seen coming rather than just arriving.
 */
function drawHotStreakReady(renderer: Renderer, world: World, loudness: number): void {
  if (world.state !== 'running') return
  for (const weapon of world.weapons) {
    const every = Math.round(weaponStat(world, weapon, 'hotStreak'))
    if (every <= 0 || (weapon.streak ?? 0) < every - 1) continue
    const pulse = 0.7 + 0.3 * Math.sin(world.time * 10)
    renderer.fillWorldCircle(world.character.x, world.character.y, world.character.radius * 1.8, weapon.def.colour, 0.3 * pulse * loudness)
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
    // An empowered bolt burns with a halo round it, and one fired up coming
    // through a wall (Kiln) glows orange, whatever it was to begin with.
    if (projectile.empowered) renderer.drawWorldOrb(projectile.x, projectile.y, projectile.radius * 1.6, FLIGHT_HEIGHT, projectile.colour, loudness)
    if (projectile.kilnBurn) renderer.drawWorldOrb(projectile.x, projectile.y, projectile.radius * 1.5, FLIGHT_HEIGHT, WALL_TINT, 0.7 * loudness)
    renderer.drawWorldSprite(sheet, frame, projectile.x, projectile.y, FLIGHT_HEIGHT, h * sheet.aspect, h, loudness)
  }
}

/** Ball Lightning's orbs, from the same clock the damage uses. */
function drawOrbits(renderer: Renderer, world: World, loudness: number): void {
  if (world.state !== 'running') return
  for (const weapon of allWeapons(world)) {
    if (weapon.def.behaviour !== 'orbit' || !weapon.def.enabled) continue
    const size = weaponStat(world, weapon, 'size')
    // A faint track, so the orbit reads as one thing rather than loose sparks.
    const centre = casterOf(world, weapon)
    renderer.strokeWorldCircle(centre.x, centre.y, weaponStat(world, weapon, 'area'), weapon.def.colour, 1, 0.12 * loudness)
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
      if (effect.condition !== 'rooted') continue
      const colour = effect.source?.def.colour ?? '#6fcf5a'
      renderer.strokeWorldCircle(enemy.x, enemy.y, enemy.def.radius + 4, colour, 2, 0.8 * loudness)
      break
    }
  }
}
