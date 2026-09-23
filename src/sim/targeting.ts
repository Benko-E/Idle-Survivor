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

/**
 * Up to `count` distinct enemies within range, nearest first.
 *
 * Collects into a caller-supplied array so casting doesn't allocate. Sorting
 * everything in range is fine at one cast a second; if a spell ever wants
 * this every frame, swap in a partial selection.
 */
export function nearestEnemies(world: World, x: number, y: number, maxRange: number, count: number, out: Enemy[]): Enemy[] {
  enemiesInRadius(world, x, y, maxRange, out)
  if (out.length > count) {
    out.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
    out.length = count
  }
  return out
}

/**
 * Choose up to `count` enemies to drop something on, `spacing` apart where
 * possible so several strikes cover more ground. When the crowd is too tight
 * for that, the rest double up rather than being thrown away — three strikes
 * on one tight pack still beats one.
 *
 * 'densest' scores each candidate by how many enemies stand within `spacing`
 * of it — the biggest crowd wins. Only a sample of candidates is scored,
 * because counting neighbours for all four hundred enemies on every cast
 * would cost far more than the choice is worth.
 */
export function pickTargets(
  world: World,
  x: number,
  y: number,
  range: number,
  count: number,
  spacing: number,
  mode: 'densest' | 'random' | 'nearest',
  out: Enemy[],
): Enemy[] {
  const pool = enemiesInRadius(world, x, y, range, candidateScratch)
  out.length = 0
  if (pool.length === 0) return out

  // Shuffle first, then take a sample: fair for 'random', and an unbiased
  // sample to score for 'densest'.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(world.rng() * (i + 1))
    const swap = pool[i]
    pool[i] = pool[j]
    pool[j] = swap
  }
  if (pool.length > DENSEST_SAMPLE) pool.length = DENSEST_SAMPLE

  if (mode === 'nearest') {
    pool.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
  } else if (mode === 'densest') {
    const crowd = new Map<Enemy, number>()
    for (const candidate of pool) {
      let near = 0
      forEachEnemyNear(world, candidate.x, candidate.y, spacing, (other) => {
        if ((other.x - candidate.x) ** 2 + (other.y - candidate.y) ** 2 <= spacing * spacing) near++
      })
      crowd.set(candidate, near)
    }
    pool.sort((a, b) => (crowd.get(b) ?? 0) - (crowd.get(a) ?? 0))
  }

  const minApartSquared = spacing * spacing
  for (const candidate of pool) {
    if (out.length >= count) break
    if (out.some((chosen) => (chosen.x - candidate.x) ** 2 + (chosen.y - candidate.y) ** 2 < minApartSquared)) continue
    out.push(candidate)
  }
  // Not enough room to spread out: fill up with whatever's left, best first.
  for (const candidate of pool) {
    if (out.length >= count) break
    if (!out.includes(candidate)) out.push(candidate)
  }
  return out
}

/** How many candidates 'densest' scores. */
const DENSEST_SAMPLE = 40
const candidateScratch: Enemy[] = []

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
