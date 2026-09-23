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

/**
 * How far away to spawn — and, via recycleStragglers, how far away to wrap.
 *
 * Sized from a *design* view rather than the actual window. The renderer pins
 * how much world is visible vertically, but not horizontally: a wider window
 * still sees further sideways. When this read the real window, a wide monitor
 * spawned enemies further out than a narrow one, and since the spawn ring
 * drives the whole run, the same seed played out differently depending on
 * the shape of the browser. That quietly broke every fixed-seed comparison.
 *
 * The design view is as wide as `spawn.designAspect`, so any window up to
 * that shape gets exactly the same ring and exactly the same run. Only a
 * window wide enough that enemies would visibly pop in at the edges falls back
 * to its real size.
 */
function spawnRingRadii(worldHalfWidth: number, worldHalfHeight: number): { rx: number; ry: number } {
  const { margin, minRadius, designAspect } = config.spawn
  const { visibleWorldHeight, yScale } = config.render

  const designHalfHeight = visibleWorldHeight / 2
  const designHalfWidth = designHalfHeight * yScale * designAspect

  // Real extents only win if they're genuinely bigger, not a rounding error
  // bigger — the 1% keeps float noise from flipping between the two and
  // making runs diverge anyway.
  const halfWidth = worldHalfWidth > designHalfWidth * 1.01 ? worldHalfWidth : designHalfWidth
  const halfHeight = worldHalfHeight > designHalfHeight * 1.01 ? worldHalfHeight : designHalfHeight

  return {
    rx: Math.max(minRadius, halfWidth * margin),
    ry: Math.max(minRadius, halfHeight * margin),
  }
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
    id: world.nextEnemyId++,
    def,
    x: world.character.x + Math.cos(angle) * rx * jitter,
    y: world.character.y + Math.sin(angle) * ry * jitter,
    hp,
    maxHp: hp,
    speed: def.baseSpeed * speedMultiplier(world.time),
    effects: [],
    stride: 0,
  })
}

/**
 * Lands a wrapped enemy slightly inside the recycle limit rather than exactly
 * on it, so jitter can't immediately push it back out and wrap it again.
 * Still comfortably off screen, since the limit is well beyond the viewport.
 */
const WRAP_INSET = 0.95

/**
 * Deals with enemies the character has left far behind.
 *
 * A faster character walking in a straight line drags the whole horde into one
 * long trailing clump — pressure from one direction only, which is dull to
 * watch and would give the danger map nothing interesting to solve. Wrapping
 * stragglers around to the far side keeps him genuinely surrounded without
 * changing the spawn rate at all.
 *
 * Only the axis that actually went out of range is mirrored. Mirroring both —
 * reflecting straight through the character — would relocate the clump intact
 * and just put the same blob in front of him. Per-axis wrapping means a group
 * that drifts off the left edge returns spread down the right side, still
 * holding whatever vertical spread it had.
 */
function recycleStragglers(world: World, halfViewWidth: number, halfViewHeight: number): void {
  const { rx, ry } = spawnRingRadii(halfViewWidth, halfViewHeight)
  const { wrapAround, wrapJitter, recycleMultiplier } = config.spawn
  const limitX = rx * recycleMultiplier
  const limitY = ry * recycleMultiplier
  const { x: cx, y: cy } = world.character

  // Backwards, so removing an element doesn't skip the next one.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i]
    const dx = enemy.x - cx
    const dy = enemy.y - cy
    const outX = Math.abs(dx) > limitX
    const outY = Math.abs(dy) > limitY

    if (!outX && !outY) continue

    if (!wrapAround) {
      world.enemies[i] = world.enemies[world.enemies.length - 1]
      world.enemies.pop()
      continue
    }

    // Jitter is applied only to axes that weren't mirrored. Jittering a
    // mirrored axis could drag it back far enough to appear on screen.
    const nx = outX ? -Math.sign(dx) * limitX * WRAP_INSET : dx + (world.rng() * 2 - 1) * rx * wrapJitter
    const ny = outY ? -Math.sign(dy) * limitY * WRAP_INSET : dy + (world.rng() * 2 - 1) * ry * wrapJitter

    enemy.x = cx + nx
    enemy.y = cy + ny
    world.wraps++
  }
}

export function updateSpawner(world: World, dt: number, halfViewWidth: number, halfViewHeight: number): void {
  recycleStragglers(world, halfViewWidth, halfViewHeight)

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
