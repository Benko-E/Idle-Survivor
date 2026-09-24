import { config } from '../config'
import type { GameEvents } from '../sim/events'
import type { Enemy, World } from '../sim/world'
import type { EnemyDef } from '../data/types'
import type { Drawable, Renderer } from './renderer'
import { isHeld } from '../sim/statusEffects'
import { getSheet, stickyFacingRow, walkFrame } from './sprites'

/**
 * How enemies look from moment to moment: fading in when they appear, a white
 * flash when something hits them, and a squash, fade and puff of dust when
 * they die. Also what they're up to: a boar shaking as it paws the ground and
 * kicking up dust as it charges, a lit wisp pulsing and swelling, and the gas
 * a Stinkcap leaves behind. And the conditions on them: each one's tint from
 * data/conditions.ts, the strongest showing, with embers off the burning and
 * sparks off the shocked; frozen ones stop mid-step.
 *
 * All render-side and fed by the `enemyDamaged` event, like the damage
 * numbers — the simulation removes a dead enemy the same step it dies and
 * never knows it was given a send-off. What's left of it here is a snapshot:
 * where it stood, which way it faced, which foot it was on.
 */

interface Corpse {
  def: EnemyDef
  id: number
  x: number
  y: number
  row: number | undefined
  col: number | undefined
  /** World time it died. */
  at: number
}

/** Dust puffs per death, spread evenly around it. */
const PUFFS = 5

export class EnemyLooks {
  /** World time of each enemy's last direct hit. Cleared as flashes end. */
  private readonly hitAt = new Map<number, number>()
  /** World time each enemy was first drawn, for the fade in. */
  private readonly bornAt = new WeakMap<Enemy, number>()
  /** The walk frame each was last on, to hold it there while it can't move. */
  private readonly lastFrame = new WeakMap<Enemy, number>()

  private heldFrame(enemy: Enemy, fallback: number): number {
    return this.lastFrame.get(enemy) ?? fallback
  }
  private readonly corpses: Corpse[] = []

  record(event: GameEvents['enemyDamaged'], world: World): void {
    if (!event.overTime) this.hitAt.set(event.enemyId, world.time)
    if (!event.killed) return
    this.hitAt.delete(event.enemyId)
    // Still in the array: the dead are swept up at the end of the combat step.
    const enemy = world.enemies.find((e) => e.id === event.enemyId)
    if (!enemy) return
    const sheet = getSheet(enemy.def.sprite)
    this.corpses.push({
      def: enemy.def,
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      row: sheet ? stickyFacingRow(enemy, world.character.x - enemy.x, world.character.y - enemy.y, config.render.facingSlackDegrees) : undefined,
      col: sheet ? walkFrame(enemy.stride, enemy.id, config.character.stepLength) : undefined,
      at: world.time,
    })
  }

  clear(): void {
    this.hitAt.clear()
    this.corpses.length = 0
  }

  /**
   * The living, with their fade in and hit flash, and then the dying.
   * Walkers go into `frame`, sorted in with the trees and him; fliers into
   * `air`, drawn over all of it once their shadows are on the ground.
   */
  push(frame: Drawable[], air: Drawable[], world: World): void {
    const { flashSeconds, spawnFadeSeconds, deathSeconds } = config.render.enemyFx

    for (const enemy of world.enemies) {
      const item = drawable(enemy.def, enemy.x, enemy.y)
      item.lift = flightLift(enemy.def, enemy.id, world.time)
      const sheet = item.sheet
      if (sheet) {
        // Walkers head straight at him, so their heading is simply the
        // direction to the character; a charge faces down its own lane.
        const charging = enemy.mode !== undefined && enemy.dirX !== undefined
        const hx = charging ? (enemy.dirX ?? 0) : world.character.x - enemy.x
        const hy = charging ? (enemy.dirY ?? 0) : world.character.y - enemy.y
        item.frameRow = stickyFacingRow(enemy, hx, hy, config.render.facingSlackDegrees)
        // Things that never walk still breathe, slowly, so they read as alive.
        item.frameCol = enemy.def.stationary
          ? walkFrame(world.time * 20, enemy.id, config.character.stepLength)
          : walkFrame(enemy.stride, enemy.id, config.character.stepLength)
        // Held fast — frozen, rooted — stops the feet on whatever step they
        // were on, rather than walking on the spot.
        if (isHeld(enemy)) item.frameCol = this.heldFrame(enemy, item.frameCol)
        else this.lastFrame.set(enemy, item.frameCol)
      }

      // The most visible condition shows, flickering a little so it reads as
      // alive rather than as a different-coloured enemy.
      let tintStrength = 0
      for (const effect of enemy.effects) {
        if (effect.def.tintStrength <= tintStrength) continue
        tintStrength = effect.def.tintStrength
        item.tint = effect.def.tint
      }
      if (tintStrength > 0) item.tintAmount = tintStrength * (0.85 + 0.15 * Math.sin(world.time * 9 + enemy.id))

      // Pawing the ground: a shiver on the spot, the warning a charge is coming.
      if (enemy.mode === 'windup') item.x += Math.sin(world.time * 70 + enemy.id) * 1.5

      // A lit fuse pulses white, faster and bigger as it runs down.
      const fuse = enemy.def.fuse
      let fuseFlash = 0
      if (fuse && enemy.fuseLeft !== undefined) {
        const burnt = fuse.seconds > 0 ? 1 - Math.max(0, enemy.fuseLeft) / fuse.seconds : 1
        fuseFlash = 0.35 + 0.35 * Math.sin(world.time * (18 + 30 * burnt))
        item.w *= 1 + 0.3 * burnt
        item.h *= 1 + 0.3 * burnt
      }

      let born = this.bornAt.get(enemy)
      if (born === undefined) {
        born = world.time
        this.bornAt.set(enemy, born)
      }
      const age = world.time - born
      if (age < spawnFadeSeconds) item.alpha = age / spawnFadeSeconds

      const hit = this.hitAt.get(enemy.id)
      if (hit !== undefined) {
        const since = world.time - hit
        if (since >= flashSeconds || since < 0) this.hitAt.delete(enemy.id)
        else item.flash = 1 - since / flashSeconds
      }
      if (fuseFlash > (item.flash ?? 0)) item.flash = fuseFlash
      ;(enemy.def.flying ? air : frame).push(item)
    }

    // Oldest first, so the finished ones come off the front.
    while (this.corpses.length > 0 && world.time - this.corpses[0].at > deathSeconds) this.corpses.shift()
    for (const corpse of this.corpses) {
      const t = Math.max(0, (world.time - corpse.at) / deathSeconds)
      const item = drawable(corpse.def, corpse.x, corpse.y)
      item.frameRow = corpse.row
      item.frameCol = corpse.col
      // Flattened into the ground: wider, much shorter, white and fading.
      item.w *= 1 + 0.35 * t
      item.h *= 1 - 0.7 * t
      item.alpha = 1 - t
      item.flash = 1 - t
      item.shadowRadius = corpse.def.radius * (1 - t)
      // A flier drops out of the sky as it goes.
      item.lift = flightLift(corpse.def, corpse.id, corpse.at) * (1 - t)
      ;(corpse.def.flying ? air : frame).push(item)
    }
  }

  /**
   * Gas on the ground: a sickly haze with slow, turning puffs in it, fading
   * in when it's released and out as it thins. Drawn under everyone's feet.
   */
  drawGround(renderer: Renderer, world: World): void {
    for (const hazard of world.hazards) {
      const age = hazard.total - hazard.remaining
      const alpha = Math.min(1, age / 0.3, hazard.remaining / 0.8)
      renderer.fillWorldCircle(hazard.x, hazard.y, hazard.radius, hazard.colour, 0.28 * alpha)
      for (let i = 0; i < 6; i++) {
        const turn = world.time * 0.6 * (i % 2 === 0 ? 1 : -1)
        const angle = (i / 6) * Math.PI * 2 + turn
        const out = hazard.radius * 0.5
        const puff = hazard.radius * (0.38 + 0.08 * Math.sin(world.time * 2 + i))
        renderer.fillWorldCircle(hazard.x + Math.cos(angle) * out, hazard.y + Math.sin(angle) * out, puff, hazard.colour, 0.22 * alpha)
      }
    }
  }

  /** Dust thrown up by the dying and by charges, embers and sparks off the afflicted. Drawn over the scene. */
  drawDust(renderer: Renderer, world: World): void {
    // Embers rising off anything burning, sparks jumping off anything shocked.
    for (const enemy of world.enemies) {
      if (enemy.effects.length === 0) continue
      let burning = false
      let shocked = false
      for (const effect of enemy.effects) {
        if (effect.condition === 'burning') burning = true
        else if (effect.condition === 'shocked') shocked = true
      }
      const size = enemy.def.radius
      const lift = flightLift(enemy.def, enemy.id, world.time)
      if (burning) {
        for (let i = 0; i < 2; i++) {
          const phase = (world.time * 1.6 + i * 0.5 + enemy.id * 0.29) % 1
          const x = enemy.x + Math.sin(enemy.id * 1.7 + i * 2.1 + world.time * 3) * size * 0.6
          // Rising: further up the screen is a smaller world y.
          const y = enemy.y - size * 0.8 - phase * size * 2.2
          renderer.fillWorldCircle(x, y, 1.6 + (1 - phase) * 1.4, i === 0 ? '#ffb347' : '#ff6a2a', 0.9 * (1 - phase), lift)
        }
      }
      if (shocked && Math.sin(world.time * 23 + enemy.id * 3.1) > 0.3) {
        const angle = world.time * 11 + enemy.id
        const x = enemy.x + Math.cos(angle) * size * 0.9
        const y = enemy.y - size + Math.sin(angle) * size * 0.9
        renderer.fillWorldCircle(x, y, 2, '#e8dcff', 0.95, lift)
      }
    }

    // A charge kicks up a trail behind it; a windup scuffs the ground.
    for (const enemy of world.enemies) {
      if (enemy.mode !== 'charge' && enemy.mode !== 'windup') continue
      const size = enemy.def.radius
      const back = enemy.mode === 'charge' ? 1 : 0.4
      for (let i = 0; i < 3; i++) {
        const phase = (world.time * 4 + i / 3 + enemy.id * 0.13) % 1
        const behind = size * (0.6 + 2.2 * phase * back)
        const side = (i - 1) * size * 0.5
        const x = enemy.x - (enemy.dirX ?? 0) * behind - (enemy.dirY ?? 0) * side
        const y = enemy.y - (enemy.dirY ?? 0) * behind + (enemy.dirX ?? 0) * side
        renderer.fillWorldCircle(x, y, size * (0.25 + 0.35 * phase), '#cbbfa6', 0.5 * (1 - phase))
      }
    }

    const { deathSeconds } = config.render.enemyFx
    for (const corpse of this.corpses) {
      const t = Math.max(0, Math.min(1, (world.time - corpse.at) / deathSeconds))
      const size = corpse.def.radius
      const out = size * (0.4 + 1.1 * t)
      for (let i = 0; i < PUFFS; i++) {
        const angle = ((i + (corpse.id % 7) * 0.13) / PUFFS) * Math.PI * 2
        const x = corpse.x + Math.cos(angle) * out
        const y = corpse.y + Math.sin(angle) * out
        renderer.fillWorldCircle(x, y, size * (0.25 + 0.3 * t), '#d9d2c3', 0.55 * (1 - t))
      }
    }
  }
}

/** How far off the ground a flier is right now: a steady height with a slow bob. Zero for walkers. */
function flightLift(def: EnemyDef, id: number, time: number): number {
  if (!def.flying) return 0
  const { flightHeight, flightBob } = config.render
  return flightHeight + flightBob * Math.sin(time * 4 + id * 1.3)
}

/** Sized from the art at the shared enemy pixel density, or a plain box without it. */
function drawable(def: EnemyDef, x: number, y: number): Drawable {
  const sheet = getSheet(def.sprite)
  const pixel = config.render.enemyPixelScale * (def.scale ?? 1)
  return {
    x,
    y,
    w: sheet ? sheet.frameWidth * pixel : def.radius * 2,
    h: sheet ? sheet.frameHeight * pixel : def.radius * 2.4,
    colour: def.colour,
    sheet,
    shadowRadius: def.radius,
  }
}
