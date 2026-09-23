import { config } from '../config'

/**
 * The influence map. (spec 3)
 *
 * An invisible grid laid over the world around the character. Anything that
 * should attract or repel him stamps a blob of score into the cells near it,
 * falling off with distance, and the character walks uphill.
 *
 * The single most important property of this file is that it knows nothing
 * about what any layer *means*. There is no enemy code here and no pickup
 * code here — only "something at (x, y) contributed this much". Adding gold,
 * health pickups or hazards later means adding a layer entry to the config
 * and one stamping call. It requires no changes in here at all.
 *
 * The same goes for the future "focus XP / focus gold" buttons: those are
 * nothing but writes to a layer's `weight` at runtime. No new AI code.
 */

/**
 * Shape of a layer's influence as distance grows, from the source out to its
 * radius. Named by the shape they produce rather than by any physical
 * analogy, because that's what you're actually choosing between when tuning.
 *
 *   sharp   concentrated hard against the source, fades fast. Good for danger:
 *           standing next to one enemy should be far worse than two steps away.
 *   linear  an even ramp.
 *   smooth  eased at both ends. The least "edgy" and the least directional.
 *   wide    spreads its influence right out to the rim. Good for value: a
 *           distant pickup should still tug.
 */
export type Falloff = 'sharp' | 'linear' | 'smooth' | 'wide'

export interface LayerSettings {
  /**
   * Signed. Positive attracts, negative repels — danger is simply a layer
   * with a negative weight, which is why `value - danger` from the spec
   * collapses into one uniform sum here instead of two special cases.
   */
  weight: number
  radius: number
  falloff: string
}

/** `t` runs 1 at the source down to 0 at the radius. */
function applyFalloff(t: number, falloff: string): number {
  switch (falloff) {
    case 'sharp':
      return t * t
    case 'smooth':
      return t * t * (3 - 2 * t)
    case 'wide':
      return Math.sqrt(t)
    case 'linear':
    default:
      return t
  }
}

export class InfluenceMap {
  readonly size: number
  readonly scores: Float32Array

  /**
   * Danger magnitude only, kept separate from the total.
   *
   * The flow pass needs to know where the walls are, and it can't recover
   * that from `scores` — a cell with a pack of enemies standing on a pile of
   * loot sums to roughly zero, which is indistinguishable from empty ground
   * and is exactly the sort of place value must not flow through.
   */
  readonly hazard: Float32Array

  /**
   * Value that exists *only* to be routed by the flow pass, never read raw.
   *
   * A reward placed straight into `scores` is felt along every straight line
   * through the world, including the one through the middle of a pack. Placed
   * here instead, the only way it reaches him is by flowing around danger.
   */
  private readonly seeds: Float32Array

  /** Cells something solid stands in. The flow can't pass them. */
  private readonly blocked: Uint8Array

  /** Scratch for the flow pass, allocated once. */
  private readonly flow: Float32Array
  private readonly passability: Float32Array

  /** World position of the centre of cell (0, 0). */
  private originX = 0
  private originY = 0

  constructor(
    readonly cellSize: number,
    readonly halfCells: number,
  ) {
    this.size = halfCells * 2 + 1
    const cells = this.size * this.size
    this.scores = new Float32Array(cells)
    this.hazard = new Float32Array(cells)
    this.seeds = new Float32Array(cells)
    this.blocked = new Uint8Array(cells)
    this.flow = new Float32Array(cells)
    this.passability = new Float32Array(cells)
  }

  /**
   * Clear the grid and re-centre it on the character.
   *
   * The origin snaps to whole cells rather than tracking him exactly. Without
   * that, every cell boundary slides continuously underneath the sampling and
   * the whole field shimmers, which reads as the character twitching.
   */
  beginUpdate(centreX: number, centreY: number): void {
    const snappedX = Math.round(centreX / this.cellSize) * this.cellSize
    const snappedY = Math.round(centreY / this.cellSize) * this.cellSize
    this.originX = snappedX - this.halfCells * this.cellSize
    this.originY = snappedY - this.halfCells * this.cellSize
    this.scores.fill(0)
    this.hazard.fill(0)
    this.seeds.fill(0)
    this.blocked.fill(0)
  }

  /**
   * Mark the cells a solid circle covers as walls. Only the flow reads this:
   * value can't pass through, so routes bend round trees instead of through
   * them. At least the cell the centre is in, however thin the trunk.
   */
  block(x: number, y: number, radius: number): void {
    const gx = (x - this.originX) / this.cellSize
    const gy = (y - this.originY) / this.cellSize
    const reach = radius / this.cellSize
    const minIy = Math.max(0, Math.ceil(gy - reach))
    const maxIy = Math.min(this.size - 1, Math.floor(gy + reach))
    const minIx = Math.max(0, Math.ceil(gx - reach))
    const maxIx = Math.min(this.size - 1, Math.floor(gx + reach))
    for (let iy = minIy; iy <= maxIy; iy++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        if ((ix - gx) ** 2 + (iy - gy) ** 2 <= reach * reach) this.blocked[iy * this.size + ix] = 1
      }
    }
    const cx = Math.round(gx)
    const cy = Math.round(gy)
    if (cx >= 0 && cy >= 0 && cx < this.size && cy < this.size) this.blocked[cy * this.size + cx] = 1
  }

  /**
   * Add a point of value for the flow pass to route, and nothing else.
   *
   * Placed whole in the nearest cell rather than split across four. The flow
   * keeps the *best* value reachable, not the sum, so a coin split four ways
   * read as a quarter of a coin whenever it sat near a cell corner. Nearest
   * cell does snap, but seeds are loot lying still, and the grid only ever
   * shifts by whole cells, so nothing is seen to jump.
   */
  seed(x: number, y: number, amount: number): void {
    const ix = Math.round((x - this.originX) / this.cellSize)
    const iy = Math.round((y - this.originY) / this.cellSize)
    if (ix < 0 || iy < 0 || ix >= this.size || iy >= this.size) return
    this.seeds[iy * this.size + ix] += amount
  }

  /**
   * Add one source's influence.
   *
   * `strength` is a per-source multiplier on top of the layer weight — it's
   * how a Hulk can be more frightening than a Shambler using the same layer,
   * driven by a number in the enemy's data entry rather than by a branch.
   */
  stamp(settings: LayerSettings, x: number, y: number, strength = 1, isHazard = false): void {
    const { radius, falloff } = settings
    if (radius <= 0) return
    const amount = settings.weight * strength
    if (amount === 0) return

    // Evaluated at each cell's true distance from the source, not from the
    // cell the source happens to be in. Snapping sources to cells (as a
    // precomputed kernel does) made an enemy's danger jump a whole cell at a
    // time as it walked, and every jump could flip which way he wanted to go.
    const gx = (x - this.originX) / this.cellSize
    const gy = (y - this.originY) / this.cellSize
    const reach = radius / this.cellSize
    const minIy = Math.max(0, Math.ceil(gy - reach))
    const maxIy = Math.min(this.size - 1, Math.floor(gy + reach))
    const minIx = Math.max(0, Math.ceil(gx - reach))
    const maxIx = Math.min(this.size - 1, Math.floor(gx + reach))
    const invReachSquared = 1 / (reach * reach)

    for (let iy = minIy; iy <= maxIy; iy++) {
      const dy = iy - gy
      const row = iy * this.size
      for (let ix = minIx; ix <= maxIx; ix++) {
        const dx = ix - gx
        const distanceSquared = (dx * dx + dy * dy) * invReachSquared
        if (distanceSquared >= 1) continue
        const contribution = applyFalloff(1 - Math.sqrt(distanceSquared), falloff) * amount
        this.scores[row + ix] += contribution
        if (isHazard) this.hazard[row + ix] += Math.abs(contribution)
      }
    }
  }

  /**
   * Add a layer that is defined per cell rather than stamped from sources.
   *
   * Needed for anything whose influence is a property of the *ground* — how
   * long he's camped there, terrain, a future zone effect. Stamping those with
   * a kernel would double-count badly, because overlapping cells each
   * contribute a full blob and twenty of them sum to twenty times too much.
   * Here each cell is asked once and answers for itself.
   */
  addPerCell(contribution: (worldX: number, worldY: number) => number): void {
    for (let iy = 0; iy < this.size; iy++) {
      const worldY = this.cellCentreY(iy)
      const row = iy * this.size
      for (let ix = 0; ix < this.size; ix++) {
        this.scores[row + ix] += contribution(this.cellCentreX(ix), worldY)
      }
    }
  }

  /**
   * Flood reward outward so it flows *around* danger instead of through it,
   * and fold the result back into the field.
   *
   * This is the thing that fixes the movement AI's whole class of problem.
   * Everything before it steered by firing straight probes into the raw
   * field, and a straight line cannot represent going around an obstacle —
   * a probe aimed at a globe behind a pack of enemies averages in the pack
   * and reads as "bad idea", so he stayed put. Long probes only made that
   * worse, because they averaged over more terrain, and they overshot
   * anything close by.
   *
   * Here a cell's value is the best value reachable *from* it: the maximum of
   * its neighbours, faded a little per step and throttled by how passable the
   * cell is. Danger doesn't subtract from the value flowing past, it
   * constricts it — so a wall of enemies with a gap has value pouring through
   * the gap, and walking uphill takes him through it.
   *
   * Implemented as alternating raster sweeps rather than a priority queue.
   * Updates are read back immediately within a sweep, so information travels
   * the length of the grid in a single pass, and four passes cover every
   * direction. It's approximate where a Dijkstra would be exact, and it's a
   * fraction of the cost for a field that gets thrown away 30 times a second.
   */
  computeFlow(): void {
    const { sweeps, decay, hazardResistance, minPassability, weight } = config.influence.flow
    const { size, scores, hazard, seeds, flow, passability, blocked } = this

    for (let i = 0; i < flow.length; i++) {
      // Only rewards seed the flood. Negative cells are obstacles to route
      // around, not sources of anything.
      flow[i] = (scores[i] > 0 ? scores[i] : 0) + seeds[i]
      passability[i] = blocked[i] ? 0 : Math.max(minPassability, 1 / (1 + hazard[i] * hazardResistance))
    }

    const straight = decay
    // A diagonal step covers more ground, so it should cost more to cross.
    const diagonal = Math.pow(decay, Math.SQRT2)

    for (let sweep = 0; sweep < sweeps; sweep++) {
      const forward = sweep % 2 === 0
      const first = forward ? 0 : size - 1
      const past = forward ? size : -1
      const step = forward ? 1 : -1

      for (let y = first; y !== past; y += step) {
        for (let x = first; x !== past; x += step) {
          const index = y * size + x
          const throughput = passability[index]
          let best = flow[index]

          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy
            if (ny < 0 || ny >= size) continue

            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const nx = x + dx
              if (nx < 0 || nx >= size) continue

              const fade = dx !== 0 && dy !== 0 ? diagonal : straight
              const candidate = flow[ny * size + nx] * fade * throughput
              if (candidate > best) best = candidate
            }
          }

          flow[index] = best
        }
      }
    }

    // Folded into the field rather than kept separate, so sampling and the
    // heatmap both automatically show what he actually steers on.
    for (let i = 0; i < scores.length; i++) scores[i] += weight * flow[i]
  }

  /**
   * Read the field at an arbitrary world position, interpolating between the
   * four surrounding cells.
   *
   * Interpolating rather than reading the nearest cell is what stops the
   * character flip-flopping between two adjacent cells of near-equal score.
   * Cell-to-cell snapping is the classic influence-map jitter.
   */
  sample(x: number, y: number): number {
    const gx = (x - this.originX) / this.cellSize
    const gy = (y - this.originY) / this.cellSize

    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0

    const s00 = this.at(x0, y0)
    const s10 = this.at(x0 + 1, y0)
    const s01 = this.at(x0, y0 + 1)
    const s11 = this.at(x0 + 1, y0 + 1)

    return s00 * (1 - fx) * (1 - fy) + s10 * fx * (1 - fy) + s01 * (1 - fx) * fy + s11 * fx * fy
  }

  /**
   * How much danger has been stamped at a world position so far this rebuild,
   * as a positive magnitude. Only meaningful after the hazards are stamped.
   */
  hazardAt(x: number, y: number): number {
    const ix = Math.round((x - this.originX) / this.cellSize)
    const iy = Math.round((y - this.originY) / this.cellSize)
    if (ix < 0 || iy < 0 || ix >= this.size || iy >= this.size) return 0
    return this.hazard[iy * this.size + ix]
  }

  /** Out of bounds reads as neutral, so the edge of the grid isn't a cliff. */
  private at(ix: number, iy: number): number {
    if (ix < 0 || iy < 0 || ix >= this.size || iy >= this.size) return 0
    return this.scores[iy * this.size + ix]
  }

  /** World position of a cell's centre. Used by the debug heatmap. */
  cellCentreX(ix: number): number {
    return this.originX + ix * this.cellSize
  }

  cellCentreY(iy: number): number {
    return this.originY + iy * this.cellSize
  }
}
