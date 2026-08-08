import { config } from '../config'
import type { World } from './world'

/**
 * How long he has camped in each patch of ground. The "get out of here" signal.
 *
 * Distinct from the breadcrumb trail, and the difference is the whole point.
 * The trail marks a *line* — where he passed — so circling wraps it around the
 * loop and leaves the middle clean, and a short sideways hop escapes it. This
 * accumulates dwell time over an *area*, so a patch he has been orbiting for a
 * minute goes uniformly sour and there is no short hop out of it. The only way
 * to escape is to actually leave.
 *
 * Measured field values at the time this was written: standing in the middle of
 * his loop scored +4.5, and open ground 400 units away scored +2 to +5. The
 * decision was a coin flip, which is why he never went anywhere. This layer has
 * to be big enough to break that tie decisively, not politely.
 *
 * It fades once he leaves, so ground recovers and he can come back to it later —
 * which matters, because globes keep dropping on ground he abandoned.
 */

interface OccupancyCell {
  /** Seconds of dwell accumulated, before decay. */
  amount: number
  /** World time `amount` was last correct at. Decay is applied lazily. */
  updated: number
}

function key(cellX: number, cellY: number): number {
  return ((cellX & 0xffff) << 16) | (cellY & 0xffff)
}

/** Halve the stored dwell every halfLifeSeconds since it was last touched. */
function decayed(cell: OccupancyCell, now: number): number {
  const elapsed = now - cell.updated
  if (elapsed <= 0) return cell.amount
  return cell.amount * Math.pow(0.5, elapsed / config.occupancy.halfLifeSeconds)
}

export function updateOccupancy(world: World, dt: number): void {
  const { cellSize, maxCells, pruneBelow } = config.occupancy
  const cellX = Math.floor(world.character.x / cellSize)
  const cellY = Math.floor(world.character.y / cellSize)
  const k = key(cellX, cellY)

  const existing = world.occupancy.get(k)
  if (existing) {
    existing.amount = decayed(existing, world.time) + dt
    existing.updated = world.time
  } else {
    world.occupancy.set(k, { amount: dt, updated: world.time })
  }

  // Prune faded cells. Cheap because it only runs when the map is getting big,
  // and a faded cell contributes nothing anyway.
  if (world.occupancy.size <= maxCells) return
  for (const [cellKey, cell] of world.occupancy) {
    if (decayed(cell, world.time) < pruneBelow) world.occupancy.delete(cellKey)
  }
}

/** 0 for fresh ground, 1 for somewhere he has thoroughly camped. */
export function occupancySaturation(world: World, worldX: number, worldY: number): number {
  const { cellSize, saturationSeconds } = config.occupancy
  const cell = world.occupancy.get(key(Math.floor(worldX / cellSize), Math.floor(worldY / cellSize)))
  if (!cell) return 0
  return Math.min(1, decayed(cell, world.time) / saturationSeconds)
}
