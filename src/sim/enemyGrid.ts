import { config } from '../config'
import { ENEMY_DEFS } from '../data/enemies'
import { SpatialGrid } from './spatialGrid'
import type { Enemy, World } from './world'

/**
 * One shared neighbour index over the enemies, rebuilt once per frame.
 *
 * Crowd separation and spell targeting both need "what's near this point?",
 * and building two grids per frame to answer the same question would be
 * silly. Derived data, not game state, which is why it lives at module level.
 */
const grid = new SpatialGrid(config.enemies.gridCellSize)

/**
 * The biggest enemy radius in the roster, worked out from the data rather
 * than written down. Any "is anything touching this point?" query must reach
 * this far past its own radius, or a large enemy's edge goes undetected.
 * Projectiles used to hard-code 24 here, so adding a boss bigger than that as
 * a plain data entry would have made part of it quietly unhittable.
 */
export const LARGEST_ENEMY_RADIUS = Math.max(...ENEMY_DEFS.map((def) => def.radius))

export function rebuildEnemyGrid(world: World): void {
  grid.clear()
  for (let i = 0; i < world.enemies.length; i++) {
    grid.insert(i, world.enemies[i].x, world.enemies[i].y)
  }
}

/**
 * Visit every live enemy whose cell overlaps the given circle.
 *
 * Candidates only — the caller still distance-checks. Enemies already reduced
 * to zero HP this frame are skipped: they're still in the array until the
 * sweep at the end of combat, but a chain shouldn't jump to a corpse.
 */
export function forEachEnemyNear(
  world: World,
  x: number,
  y: number,
  radius: number,
  visit: (enemy: Enemy, index: number) => void,
): void {
  grid.forEachNear(x, y, radius, (index) => {
    const enemy = world.enemies[index]
    if (!enemy || enemy.hp <= 0) return
    visit(enemy, index)
  })
}
