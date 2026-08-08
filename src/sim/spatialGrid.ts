/**
 * A uniform grid for "what is near this point?" queries.
 *
 * Checking every enemy against every other enemy is fine at 50 enemies and
 * ruinous at 500 — it grows with the square of the count, and a survivors-like
 * spends most of its time in the high hundreds. This buckets things by cell so
 * a neighbour lookup only touches the handful of cells that could possibly
 * contain a match.
 *
 * Used by crowd separation now; the danger map and weapon targeting will both
 * want it later.
 */
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>()

  constructor(private readonly cellSize: number) {}

  /**
   * Pack a cell coordinate pair into one integer key.
   *
   * The 16-bit mask means cells more than 65536 apart collide, which costs a
   * few extra candidates in a query that distance-checks anyway. It never
   * produces a wrong answer, only a marginally slower one.
   */
  private key(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff)
  }

  clear(): void {
    // Emptying the arrays rather than dropping them keeps the allocations
    // around between frames. This runs every frame; garbage adds up.
    for (const bucket of this.cells.values()) bucket.length = 0
  }

  insert(index: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize))
    const bucket = this.cells.get(k)
    if (bucket) bucket.push(index)
    else this.cells.set(k, [index])
  }

  /**
   * Call `visit` with the index of everything in the cells overlapping the
   * given circle. Candidates only — some will be outside `radius`, so the
   * caller still does its own distance check.
   */
  forEachNear(x: number, y: number, radius: number, visit: (index: number) => void): void {
    const minCx = Math.floor((x - radius) / this.cellSize)
    const maxCx = Math.floor((x + radius) / this.cellSize)
    const minCy = Math.floor((y - radius) / this.cellSize)
    const maxCy = Math.floor((y + radius) / this.cellSize)

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy))
        if (!bucket) continue
        for (const index of bucket) visit(index)
      }
    }
  }
}
