import { config } from '../config'
import { ENEMY_DEFS } from '../data/enemies'
import type { EnemyDef } from '../data/types'
import { hpMultiplier, spawnsPerSecond, speedMultiplier } from './difficulty'
import type { World } from './world'

/**
 * Puts enemies into the world just outside what the camera can see.
 *
 * The world is endless (spec A), so there is no arena to spawn at the edges of.
 * Instead enemies appear on a ring centred on the character, which travels with
 * him. From his point of view they always come from every side, forever.
 */

/** How far off screen to spawn, given the current viewport half-extents. */
function spawnRingRadii(halfViewWidth: number, halfViewHeight: number): { rx: number; ry: number } {
  const { margin, minRadius } = config.spawn
  // The Y radius is divided by yScale because the renderer squashes world Y.
  // Without this, "one screen away" up the screen is much further in world
  // units than the same distance sideways, and enemies from the north would
  // take twice as long to arrive.
  const rx = Math.max(minRadius, halfViewWidth * margin)
  const ry = Math.max(minRadius, (halfViewHeight / config.render.yScale) * margin)
  return { rx, ry }
}

function eligibleDefs(time: number): EnemyDef[] {
  return ENEMY_DEFS.filter((def) => time >= def.unlockAtSeconds)
}

function pickWeighted(defs: EnemyDef[], roll: number): EnemyDef {
  let total = 0
  for (const def of defs) total += def.spawnWeight

  let cursor = roll * total
  for (const def of defs) {
    cursor -= def.spawnWeight
    if (cursor <= 0) return def
  }
  return defs[defs.length - 1]
}

function spawnOne(world: World, halfViewWidth: number, halfViewHeight: number): void {
  const defs = eligibleDefs(world.time)
  if (defs.length === 0) return

  const def = pickWeighted(defs, world.rng())
  const { rx, ry } = spawnRingRadii(halfViewWidth, halfViewHeight)

  const angle = world.rng() * Math.PI * 2
  const jitter = 1 + world.rng() * config.spawn.radiusJitter

  const hp = def.baseHp * hpMultiplier(world.time)

  world.enemies.push({
    def,
    x: world.character.x + Math.cos(angle) * rx * jitter,
    y: world.character.y + Math.sin(angle) * ry * jitter,
    hp,
    maxHp: hp,
    speed: def.baseSpeed * speedMultiplier(world.time),
  })
}

/**
 * Anything this far from the character is gone for good — it can never catch
 * up, and in an endless world it would otherwise be simulated forever.
 */
function despawnStragglers(world: World, halfViewWidth: number, halfViewHeight: number): void {
  const { rx, ry } = spawnRingRadii(halfViewWidth, halfViewHeight)
  const limitX = rx * config.spawn.despawnMultiplier
  const limitY = ry * config.spawn.despawnMultiplier
  const { x: cx, y: cy } = world.character

  // Backwards, so removing an element doesn't skip the next one.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i]
    if (Math.abs(e.x - cx) > limitX || Math.abs(e.y - cy) > limitY) {
      world.enemies[i] = world.enemies[world.enemies.length - 1]
      world.enemies.pop()
    }
  }
}

export function updateSpawner(world: World, dt: number, halfViewWidth: number, halfViewHeight: number): void {
  despawnStragglers(world, halfViewWidth, halfViewHeight)

  // Credit accumulates fractionally, so a rate of 0.4/sec really does produce
  // an enemy every two and a half seconds instead of rounding down to zero.
  world.spawnCredit += spawnsPerSecond(world.time) * dt

  while (world.spawnCredit >= 1) {
    world.spawnCredit -= 1
    if (world.enemies.length >= config.spawn.maxAlive) {
      world.spawnCredit = 0
      break
    }
    spawnOne(world, halfViewWidth, halfViewHeight)
  }
}
