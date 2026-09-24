import { config } from '../config'
import { busy, updateEnemyBehaviours } from './enemyBehaviours'
import { forEachEnemyNear, LARGEST_ENEMY_RADIUS, rebuildEnemyGrid } from './enemyGrid'
import { pushOutOfObstacles } from './obstacles'
import { slowMultiplier } from './statusEffects'
import type { Enemy, World } from './world'

/**
 * Enemy movement: walk at the character, and don't stand inside each other.
 *
 * That's the whole walk, deliberately. The interesting movement in this game
 * belongs to the character — enemies are the pressure he has to read, and
 * pressure is easier to read when it's predictable. The exceptions (charges,
 * fuses) are in enemyBehaviours.ts, and anything busy there is skipped here.
 */

function seekCharacter(world: World, dt: number): void {
  const { x: cx, y: cy } = world.character

  for (const enemy of world.enemies) {
    if (enemy.def.stationary || busy(enemy)) continue
    const dx = cx - enemy.x
    const dy = cy - enemy.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.001) continue

    // Chills and other slows are applied here rather than baked into
    // enemy.speed, so an effect wearing off restores the original value with
    // no bookkeeping.
    const step = enemy.speed * slowMultiplier(enemy) * dt
    enemy.x += (dx / distance) * step
    enemy.y += (dy / distance) * step
    enemy.stride += step
  }
}

/**
 * Whether the ground gets in its way. Fliers go over it — trees today, and
 * whatever else the ground grows later (water, cliffs, hills): anything that
 * blocks a walker should ask this rather than reading `flying` itself, so
 * every new kind of terrain gets fliers right without thinking about them.
 */
export function blockedByTerrain(enemy: Enemy): boolean {
  return !enemy.def.flying
}

/**
 * Two layers, the ground and the air, that don't collide with each other: a
 * bat flies straight over a scrum of crabs instead of being shouldered aside
 * by it, and only jostles other fliers.
 */
function sameLayer(a: Enemy, b: Enemy): boolean {
  return (a.def.flying === true) === (b.def.flying === true)
}

/**
 * Push apart anything that ended up overlapping.
 *
 * Without this a crowd converging on one point collapses into a single blob
 * and you cannot tell twenty enemies from three. It also keeps the danger map
 * readable: a spread-out swarm produces a threat field with actual gaps in it
 * to dive through.
 *
 * This nudges positions directly rather than applying forces. Forces overshoot
 * and oscillate; a direct correction just resolves and stays resolved.
 */
function resolveOverlaps(world: World): void {
  const enemies = world.enemies
  const strength = config.enemies.separationStrength

  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i]
    const reach = a.def.radius + LARGEST_ENEMY_RADIUS

    forEachEnemyNear(world, a.x, a.y, reach, (b, j) => {
      // Each pair is visited from both ends; only act on it once.
      if (j <= i || !sameLayer(a, b)) return

      const dx = b.x - a.x
      const dy = b.y - a.y
      const minDistance = a.def.radius + b.def.radius
      const squared = dx * dx + dy * dy

      if (squared >= minDistance * minDistance || squared === 0) return

      const distance = Math.sqrt(squared)
      // Each of the pair moves half the overlap, scaled by strength — or all
      // of it, if the other one is rooted to the spot.
      const aFixed = a.def.stationary === true
      const bFixed = b.def.stationary === true
      if (aFixed && bFixed) return
      const push = ((minDistance - distance) / distance) * 0.5 * strength
      const aShare = aFixed ? 0 : bFixed ? 2 : 1
      const bShare = bFixed ? 0 : aFixed ? 2 : 1

      a.x -= dx * push * aShare
      a.y -= dy * push * aShare
      b.x += dx * push * bShare
      b.y += dy * push * bShare
    })
  }
}

/**
 * Keep them out of trees. Odd and even ids slide opposite ways, so a crowd
 * meeting a trunk parts round both sides of it. Fliers go straight over.
 */
function avoidObstacles(world: World): void {
  const slide = config.obstacles.enemySlide
  for (const enemy of world.enemies) {
    if (!blockedByTerrain(enemy)) continue
    pushOutOfObstacles(world, enemy, enemy.def.radius, enemy.id % 2 === 0 ? slide : -slide)
  }
}

export function updateEnemies(world: World, dt: number): void {
  updateEnemyBehaviours(world, dt)
  seekCharacter(world, dt)
  // Rebuilt after they move, then shared with spell targeting for the rest of
  // the frame.
  rebuildEnemyGrid(world)
  resolveOverlaps(world)
  // Last, so crowd pressure can't shove anyone back into a trunk after it
  // was pushed out.
  avoidObstacles(world)
}
