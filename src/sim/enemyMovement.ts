import { config } from '../config'
import { ENEMY_DEFS } from '../data/enemies'
import { SpatialGrid } from './spatialGrid'
import type { World } from './world'

/**
 * Enemy movement: walk at the character, and don't stand inside each other.
 *
 * That's the whole behaviour, deliberately. The interesting movement in this
 * game belongs to the character (step 2) — enemies are the pressure he has to
 * read, and pressure is easier to read when it's predictable.
 */

const LARGEST_RADIUS = Math.max(...ENEMY_DEFS.map((def) => def.radius))

// A scratch buffer rebuilt from scratch every frame, not game state — which is
// why it can live at module level while everything in world.ts cannot.
const grid = new SpatialGrid(config.enemies.gridCellSize)

function seekCharacter(world: World, dt: number): void {
  const { x: cx, y: cy } = world.character

  for (const enemy of world.enemies) {
    const dx = cx - enemy.x
    const dy = cy - enemy.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.001) continue

    const step = enemy.speed * dt
    enemy.x += (dx / distance) * step
    enemy.y += (dy / distance) * step
  }
}

/**
 * Push apart anything that ended up overlapping.
 *
 * Without this a crowd converging on one point collapses into a single blob
 * and you cannot tell twenty enemies from three. It's also what will make the
 * danger map readable later: a spread-out swarm produces a spread-out threat
 * field with actual gaps in it to dive through.
 *
 * This nudges positions directly rather than applying forces. Forces overshoot
 * and oscillate; a direct correction just resolves and stays resolved.
 */
function resolveOverlaps(world: World): void {
  const enemies = world.enemies
  const strength = config.enemies.separationStrength

  grid.clear()
  for (let i = 0; i < enemies.length; i++) {
    grid.insert(i, enemies[i].x, enemies[i].y)
  }

  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i]
    const reach = a.def.radius + LARGEST_RADIUS

    grid.forEachNear(a.x, a.y, reach, (j) => {
      // Each pair is visited from both ends; only act on it once.
      if (j <= i) return

      const b = enemies[j]
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

export function updateEnemies(world: World, dt: number): void {
  seekCharacter(world, dt)
  resolveOverlaps(world)
}
