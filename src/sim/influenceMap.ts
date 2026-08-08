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

interface Kernel {
  /** Half-width in cells. The stamp is (2 * radiusCells + 1) square. */
  radiusCells: number
  size: number
  values: Float32Array
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

/**
 * Stamps are identical for every source in a layer, so they're computed once
 * and reused. Cached against a signature of the settings rather than built
 * once at startup, so the debug panel can retune radius and falloff live and
 * see the result immediately.
 */
const kernelCache = new Map<string, { signature: string; kernel: Kernel }>()

function kernelFor(layerName: string, settings: LayerSettings, cellSize: number): Kernel {
  const signature = `${settings.radius}|${settings.falloff}|${cellSize}`
  const cached = kernelCache.get(layerName)
  if (cached && cached.signature === signature) return cached.kernel

  const radiusCells = Math.max(1, Math.ceil(settings.radius / cellSize))
  const size = radiusCells * 2 + 1
  const values = new Float32Array(size * size)

  for (let iy = -radiusCells; iy <= radiusCells; iy++) {
    for (let ix = -radiusCells; ix <= radiusCells; ix++) {
      const distance = Math.hypot(ix, iy) * cellSize
      const t = 1 - distance / settings.radius
      values[(iy + radiusCells) * size + (ix + radiusCells)] = t <= 0 ? 0 : applyFalloff(t, settings.falloff)
    }
  }

  const kernel: Kernel = { radiusCells, size, values }
  kernelCache.set(layerName, { signature, kernel })
  return kernel
}

export class InfluenceMap {
  readonly size: number
  readonly scores: Float32Array

  /** World position of the centre of cell (0, 0). */
  private originX = 0
  private originY = 0

  constructor(
    readonly cellSize: number,
    readonly halfCells: number,
  ) {
    this.size = halfCells * 2 + 1
    this.scores = new Float32Array(this.size * this.size)
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
  }

  /**
   * Add one source's influence.
   *
   * `strength` is a per-source multiplier on top of the layer weight — it's
   * how a Hulk can be more frightening than a Shambler using the same layer,
   * driven by a number in the enemy's data entry rather than by a branch.
   */
  stamp(layerName: string, settings: LayerSettings, x: number, y: number, strength = 1): void {
    const kernel = kernelFor(layerName, settings, this.cellSize)
    const amount = settings.weight * strength

    const cx = Math.round((x - this.originX) / this.cellSize)
    const cy = Math.round((y - this.originY) / this.cellSize)

    const k = kernel.radiusCells
    // Clip to the grid rather than skipping the source entirely: something
    // just off the edge still influences the cells inside it.
    const minIy = Math.max(-k, -cy)
    const maxIy = Math.min(k, this.size - 1 - cy)
    const minIx = Math.max(-k, -cx)
    const maxIx = Math.min(k, this.size - 1 - cx)

    for (let iy = minIy; iy <= maxIy; iy++) {
      const kernelRow = (iy + k) * kernel.size + k
      const scoreRow = (cy + iy) * this.size + cx
      for (let ix = minIx; ix <= maxIx; ix++) {
        this.scores[scoreRow + ix] += kernel.values[kernelRow + ix] * amount
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
