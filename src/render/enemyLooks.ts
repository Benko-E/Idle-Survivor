import { config } from '../config'
import type { GameEvents } from '../sim/events'
import type { Enemy, World } from '../sim/world'
import type { EnemyDef } from '../data/types'
import type { Drawable, Renderer } from './renderer'
import { getSheet, stickyFacingRow, walkFrame } from './sprites'

/**
 * How enemies look from moment to moment: fading in when they appear, a white
 * flash when something hits them, and a squash, fade and puff of dust when
 * they die.
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

  /** The living, with their fade in and hit flash, and then the dying. */
  push(frame: Drawable[], world: World): void {
    const { flashSeconds, spawnFadeSeconds, deathSeconds } = config.render.enemyFx

    for (const enemy of world.enemies) {
      const item = drawable(enemy.def, enemy.x, enemy.y)
      const sheet = item.sheet
      if (sheet) {
        // Enemies always walk straight at him, so their heading is simply the
        // direction to the character.
        item.frameRow = stickyFacingRow(enemy, world.character.x - enemy.x, world.character.y - enemy.y, config.render.facingSlackDegrees)
        item.frameCol = walkFrame(enemy.stride, enemy.id, config.character.stepLength)
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
      frame.push(item)
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
      frame.push(item)
    }
  }

  /** Dust thrown up by the dying. Drawn over the scene. */
  drawDust(renderer: Renderer, world: World): void {
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
