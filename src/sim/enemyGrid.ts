import { config } from '../config'
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
