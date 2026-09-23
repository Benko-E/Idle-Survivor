import { config } from '../config'
import { CAMP_LAYOUT, OBSTACLE_DEFS, type ObstacleDef } from '../data/obstacles'
import type { World } from './world'

/**
 * Where the trees are, and keeping things out of them.
 *
 * The world is endless, so obstacles aren't stored: each square of a coarse
 * grid asks a hash of (square, run seed) whether it has one and where. The
 * same square always gives the same answer, so a grove is still there when
 * he walks back, and a new run grows a new landscape.
 *
 * A slower noise over the same grid decides how thick things grow, which is
 * what makes groves and clearings rather than an even sprinkle. The start and
 * the shop are always kept clear, and the shop camp's own pieces — tent,
 * barrels, crates — are solid obstacles that move with the shop.
 */

export interface Obstacle {
  x: number
  y: number
  radius: number
  /** The kind; null for pieces of the shop camp. */
  def: ObstacleDef | null
  sprite: string
}

/** A well-mixed 32-bit hash of two ints and a seed, as a number in [0, 1). */
function hash(ix: number, iy: number, seed: number, salt: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed ^ salt, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise, 0 to 1, varying over `scale` squares. */
function thickness(ix: number, iy: number, seed: number): number {
  const scale = config.obstacles.groveSize
  const gx = ix / scale
  const gy = iy / scale
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const fx = gx - x0
  const fy = gy - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0, seed, 7)
  const b = hash(x0 + 1, y0, seed, 7)
  const c = hash(x0, y0 + 1, seed, 7)
  const d = hash(x0 + 1, y0 + 1, seed, 7)
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
}

const totalWeight = OBSTACLE_DEFS.reduce((sum, def) => sum + def.weight, 0)

function pickDef(roll: number): ObstacleDef {
  let cursor = roll * totalWeight
  for (const def of OBSTACLE_DEFS) {
    cursor -= def.weight
    if (cursor <= 0) return def
  }
  return OBSTACLE_DEFS[OBSTACLE_DEFS.length - 1]
}

/** The obstacle growing in one square, or null. */
function obstacleInSquare(world: World, ix: number, iy: number): Obstacle | null {
  const { cellSize, density, groveContrast, clearStart, clearShop } = config.obstacles
  const seed = world.seed
  // Density swings around its average: dense groves, open clearings.
  const local = density * Math.max(0, 1 + groveContrast * (thickness(ix, iy, seed) * 2 - 1))
  if (hash(ix, iy, seed, 1) >= local) return null

  const x = (ix + 0.15 + 0.7 * hash(ix, iy, seed, 2)) * cellSize
  const y = (iy + 0.15 + 0.7 * hash(ix, iy, seed, 3)) * cellSize
  if (x * x + y * y < clearStart * clearStart) return null
  if ((x - world.shopX) ** 2 + (y - world.shopY) ** 2 < clearShop * clearShop) return null

  const def = pickDef(hash(ix, iy, seed, 4))
  return { x, y, radius: def.radius, def, sprite: def.sprite }
}

/** The camp's pieces, where the shop is right now. */
function campPieces(world: World): Obstacle[] {
  return CAMP_LAYOUT.map((piece) => ({
    x: world.shopX + piece.dx,
    y: world.shopY + piece.dy,
    radius: piece.radius,
    def: null,
    sprite: piece.sprite,
  }))
}

/**
 * Every obstacle, solid or not, whose centre is within `reach` of a point.
 * Squares are checked on the fly; a few hash calls each, so this is cheap.
 */
export function forEachObstacleNear(world: World, x: number, y: number, reach: number, visit: (obstacle: Obstacle) => void): void {
  if (!config.obstacles.enabled) return
  const cell = config.obstacles.cellSize
  const minX = Math.floor((x - reach) / cell)
  const maxX = Math.floor((x + reach) / cell)
  const minY = Math.floor((y - reach) / cell)
  const maxY = Math.floor((y + reach) / cell)
  for (let iy = minY; iy <= maxY; iy++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const obstacle = obstacleInSquare(world, ix, iy)
      if (obstacle && Math.abs(obstacle.x - x) <= reach && Math.abs(obstacle.y - y) <= reach) visit(obstacle)
    }
  }
  if (config.shop.enabled && Math.abs(world.shopX - x) <= reach + 80 && Math.abs(world.shopY - y) <= reach + 80) {
    for (const piece of campPieces(world)) visit(piece)
  }
}

/**
 * Push something out of any obstacle it has walked into.
 *
 * Straight out along the line from the obstacle's centre, plus — when `slide`
 * isn't zero — a little sideways. Without the sideways part, an enemy walking
 * dead-centre into a trunk is pushed straight back the way it came and stands
 * there forever; with it, it slides round one side, and `slide`'s sign picks
 * which side so a crowd splits around a tree instead of all going left.
 */
export function pushOutOfObstacles(world: World, body: { x: number; y: number }, radius: number, slide: number): boolean {
  let hit = false
  forEachObstacleNear(world, body.x, body.y, radius + LARGEST_OBSTACLE, (obstacle) => {
    if (obstacle.radius <= 0) return
    const dx = body.x - obstacle.x
    const dy = body.y - obstacle.y
    const min = radius + obstacle.radius
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared >= min * min) return
    hit = true
    const distance = Math.sqrt(distanceSquared) || 0.001
    const nx = dx / distance
    const ny = dy / distance
    const overlap = min - distance
    body.x = obstacle.x + nx * min
    body.y = obstacle.y + ny * min
    if (slide !== 0) {
      body.x += -ny * overlap * slide
      body.y += nx * overlap * slide
    }
  })
  return hit
}

/** The biggest solid radius anywhere, for how far to look when colliding. */
const LARGEST_OBSTACLE = Math.max(...OBSTACLE_DEFS.map((def) => def.radius), ...CAMP_LAYOUT.map((piece) => piece.radius))
