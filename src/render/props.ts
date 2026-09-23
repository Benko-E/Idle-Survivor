import { config } from '../config'
import { forEachObstacleNear } from '../sim/obstacles'
import type { World } from '../sim/world'
import type { Drawable, Renderer } from './renderer'
import { getSheet } from './sprites'

/**
 * The world's furniture as draw-list entries: trees and stumps, and the shop
 * camp with its fire, keeper and chest.
 *
 * Everything is sized from its art at `render.pixelScale`, so a prop is as
 * big next to the hero as it is on the tileset. Obstacles come from the same
 * lookup the simulation collides with, so what you see is what's solid.
 */

/** How far outside the view to look, so tall trees don't pop in at the edge. */
const MARGIN = 160

/** How much of a tree is left when he's standing behind it. */
const BEHIND_ALPHA = 0.45

export function pushWorldProps(frame: Drawable[], renderer: Renderer, world: World, bankedAt: number): void {
  const pixel = config.render.pixelScale
  const hero = world.character
  const reachX = renderer.worldHalfWidth + MARGIN
  const reachY = renderer.worldHalfHeight + MARGIN

  forEachObstacleNear(world, renderer.camera.x, renderer.camera.y, Math.max(reachX, reachY), (obstacle) => {
    const sheet = getSheet(`prop:${obstacle.sprite}`)
    if (!sheet) return
    const w = sheet.frameWidth * pixel
    const h = sheet.frameHeight * pixel
    // The trunk's circle sits a little above the image's bottom edge, where
    // the roots are.
    const base = obstacle.y + obstacle.radius * 0.4
    const tall = obstacle.def ? obstacle.def.tall : obstacle.sprite === 'tent'
    // Behind it: further up the screen than its base, and inside its outline.
    const behind = tall && hero.y < base && hero.y > base - h && Math.abs(hero.x - obstacle.x) < w / 2
    frame.push({
      x: obstacle.x,
      y: base,
      w,
      h,
      colour: '#3f5a36',
      sheet,
      // The art has its own ground shadow and roots painted in.
      shadowRadius: 0,
      alpha: behind ? BEHIND_ALPHA : undefined,
    })
  })

  if (config.shop.enabled) pushCampLife(frame, world, bankedAt)
}

/** The camp's moving parts: fire on the logs, the keeper, the chest. */
function pushCampLife(frame: Drawable[], world: World, bankedAt: number): void {
  const pixel = config.render.pixelScale
  const { shopX, shopY } = world

  const flames = getSheet('flames')
  if (flames) {
    // On the campfire logs from the camp layout, a hair in front so it sorts over them.
    frame.push({
      x: shopX - 58,
      y: shopY + 31,
      w: flames.frameWidth * pixel,
      h: flames.frameHeight * pixel,
      colour: '#ff9a4d',
      sheet: flames,
      frameCol: Math.floor(world.time * 8) % 4,
      frameRow: 0,
      shadowRadius: 0,
    })
  }

  const keeper = getSheet('shopkeeper')
  if (keeper) {
    frame.push({
      x: shopX - 26,
      y: shopY + 22,
      w: keeper.frameWidth * pixel,
      h: keeper.frameHeight * pixel,
      colour: '#7a5a3a',
      sheet: keeper,
      frameCol: 0,
      frameRow: 0,
      shadowRadius: 7,
    })
  }

  const chest = getSheet('chest')
  if (chest) {
    // Pops open when he banks, stays open a moment, then shuts.
    const since = world.time - bankedAt
    const opening = since >= 0 && since < 2.4
    const col = opening ? Math.min(3, Math.floor(since / 0.08)) : 0
    frame.push({
      x: shopX + 22,
      y: shopY + 30,
      w: chest.frameWidth * pixel,
      h: chest.frameHeight * pixel,
      colour: '#a0703a',
      sheet: chest,
      frameCol: col,
      frameRow: 0,
      shadowRadius: 9,
    })
  }
}
