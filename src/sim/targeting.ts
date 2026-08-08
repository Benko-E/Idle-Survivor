import { forEachEnemyNear } from './enemyGrid'
import type { Enemy, World } from './world'

/**
 * Target selection, shared by every behaviour.
 *
 * Kept out of the behaviours themselves so that "nearest enemy" means the
 * same thing everywhere, and so a future targeting mode (lowest health,
 * densest cluster, already-cursed) is added in one place.
 */

export function nearestEnemy(world: World, x: number, y: number, maxRange: number, exclude?: Set<number>): Enemy | null {
  let best: Enemy | null = null
  let bestDistanceSquared = maxRange * maxRange

  forEachEnemyNear(world, x, y, maxRange, (enemy) => {
    if (exclude?.has(enemy.id)) return
    const dx = enemy.x - x
    const dy = enemy.y - y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared >= bestDistanceSquared) return
    bestDistanceSquared = distanceSquared
    best = enemy
  })

  return best
}

/** Collects into a caller-supplied array so casting doesn't allocate. */
export function enemiesInRadius(world: World, x: number, y: number, radius: number, out: Enemy[]): Enemy[] {
  out.length = 0
  const radiusSquared = radius * radius

  forEachEnemyNear(world, x, y, radius, (enemy) => {
    const dx = enemy.x - x
    const dy = enemy.y - y
    if (dx * dx + dy * dy > radiusSquared) return
    out.push(enemy)
  })

  return out
}
