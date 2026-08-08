import { config } from '../config'
import { SpatialGrid } from './spatialGrid'
import type { Pickup, World } from './world'

/**
 * Combines piles of globes into fewer, bigger ones.
 *
 * The reason this exists is a movement problem, not an economy one. Every
 * globe pulls on the character, and thirty of them scattered around him pull
 * in thirty directions that sum to almost nothing — which makes the middle of
 * the pile the best place to stand. He stops there and farms whatever happens
 * to drop on his feet, which is both correct by his rules and terrible to
 * watch.
 *
 * Merging fixes it at the source: five weak attractors that cancel become one
 * strong attractor that points somewhere. It isn't a bribe to make him move,
 * it's removing the ambiguity that stopped him.
 *
 * XP is conserved exactly (see pickupTiers.ts), so nothing about the value of
 * the ground changes — only how legible it is.
 */

const grid = new SpatialGrid(config.pickups.merge.radius)

/** Indices gathered for one merge, reused so the pass doesn't allocate. */
const group: number[] = []
const consumed: boolean[] = []
const created: Pickup[] = []

/**
 * One sweep. Returns true if anything merged, so the caller can run it again
 * and let a cascade resolve in a single tick — five Sparks make an Ember, and
 * five of those Embers should become a Soulglass right away rather than a
 * second and a half later.
 */
function mergeOnce(world: World): boolean {
  const { count, radius, maxTier } = config.pickups.merge
  const pickups = world.pickups
  const originalLength = pickups.length
  if (originalLength < count) return false

  grid.clear()
  for (let i = 0; i < originalLength; i++) {
    grid.insert(i, pickups[i].x, pickups[i].y)
  }

  consumed.length = originalLength
  consumed.fill(false)
  created.length = 0

  const radiusSquared = radius * radius
  let merged = false

  for (let i = 0; i < originalLength; i++) {
    if (consumed[i]) continue

    const a = pickups[i]
    if (!a.def.merges || a.tier >= maxTier) continue

    group.length = 0
    group.push(i)

    grid.forEachNear(a.x, a.y, radius, (j) => {
      if (group.length >= count) return
      if (j === i || consumed[j]) return

      const b = pickups[j]
      // Same kind and same size only. A Spark and an Ember don't combine —
      // that would make the ladder depend on arrival order.
      if (b.def !== a.def || b.tier !== a.tier) return

      const dx = b.x - a.x
      const dy = b.y - a.y
      if (dx * dx + dy * dy > radiusSquared) return

      group.push(j)
    })

    if (group.length < count) continue

    let sumX = 0
    let sumY = 0
    let wasNear = false
    for (const index of group) {
      sumX += pickups[index].x
      sumY += pickups[index].y
      // Carry the flag across, so merging can't launder away a near miss and
      // flatter the measurement.
      wasNear = wasNear || pickups[index].wasNear
      consumed[index] = true
    }

    created.push({
      def: a.def,
      tier: a.tier + 1,
      x: sumX / group.length,
      y: sumY / group.length,
      wasNear,
    })
    merged = true
  }

  if (!merged) return false

  // Compact in place, keeping anything added after this sweep started.
  let write = 0
  for (let read = 0; read < pickups.length; read++) {
    if (read < originalLength && consumed[read]) continue
    pickups[write++] = pickups[read]
  }
  pickups.length = write

  for (const pickup of created) pickups.push(pickup)
  return true
}

export function updatePickupMerging(world: World, dt: number): void {
  const { hz } = config.pickups.merge

  world.mergeCredit += dt
  if (world.mergeCredit < 1 / hz) return
  world.mergeCredit = 0

  // Bounded so a pathological pile can't spin here; cascades deeper than this
  // just finish on the next tick.
  for (let pass = 0; pass < 4; pass++) {
    if (!mergeOnce(world)) break
  }
}
