import { config } from '../config'
import { forEachEnemyNear, LARGEST_ENEMY_RADIUS, rebuildEnemyGrid } from './enemyGrid'
import { pushOutOfObstacles } from './obstacles'
import { slowMultiplier } from './statusEffects'
import type { World } from './world'

/**
 * Enemy movement: walk at the character, and don't stand inside each other.
 *
 * That's the whole behaviour, deliberately. The interesting movement in this
 * game belongs to the character — enemies are the pressure he has to read, and
 * pressure is easier to read when it's predictable.
 */

function seekCharacter(world: World, dt: number): void {
  const { x: cx, y: cy } = world.character

  for (const enemy of world.enemies) {
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
      if (j <= i) return

      const dx = b.x - a.x
      const dy = b.y - a.y
      const minDistance = a.def.radius + b.def.radius
      const squared = dx * dx + dy * dy

      if (squared >= minDistance * minDistance || squared === 0) return

      const distance = Math.sqrt(squared)
      // Each of the pair moves half the overlap, scaled by strength.
      const push = ((minDistance - distance) / distance) * 0.5 * strength

      a.x -= dx * push
      a.y -= dy * push
      b.x += dx * push
      b.y += dy * push
    })
  }
}

/**
 * Keep them out of trees. Odd and even ids slide opposite ways, so a crowd
 * meeting a trunk parts round both sides of it.
 */
function avoidObstacles(world: World): void {
  const slide = config.obstacles.enemySlide
  for (const enemy of world.enemies) {
    pushOutOfObstacles(world, enemy, enemy.def.radius, enemy.id % 2 === 0 ? slide : -slide)
  }
}

export function updateEnemies(world: World, dt: number): void {
  seekCharacter(world, dt)
  // Rebuilt after they move, then shared with spell targeting for the rest of
  // the frame.
  rebuildEnemyGrid(world)
  resolveOverlaps(world)
  // Last, so crowd pressure can't shove anyone back into a trunk after it
  // was pushed out.
  avoidObstacles(world)
}
