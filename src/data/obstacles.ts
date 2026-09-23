/**
 * Things standing in the world: trees, stumps, a fallen log. (spec 5.1)
 *
 * `radius` is the solid part — the trunk, not the canopy — in world units. He
 * and the enemies collide with that circle; the canopy is just drawn, and
 * fades when he walks behind it. `weight` is how common it is relative to the
 * others. A new obstacle is an entry here plus its crop in
 * tools/extract-art.ps1; the art is found by `sprite` name.
 */
export interface ObstacleDef {
  id: string
  /** File name in art-source/props/, without the extension. */
  sprite: string
  radius: number
  weight: number
  /** Big enough to hide him behind: fade it when he's there. */
  tall: boolean
}

export const OBSTACLE_DEFS: ObstacleDef[] = [
  // Trees: most of the landscape.
  { id: 'tree_oak', sprite: 'tree_oak', radius: 13, weight: 12, tall: true },
  { id: 'tree_great', sprite: 'tree_great', radius: 20, weight: 3, tall: true },
  { id: 'tree_pine', sprite: 'tree_pine', radius: 11, weight: 12, tall: true },
  { id: 'tree_small', sprite: 'tree_small', radius: 10, weight: 9, tall: true },
  { id: 'tree_fir', sprite: 'tree_fir', radius: 9, weight: 9, tall: true },
  { id: 'tree_fir2', sprite: 'tree_fir2', radius: 8, weight: 7, tall: true },
  { id: 'tree_round', sprite: 'tree_round', radius: 11, weight: 7, tall: true },
  { id: 'tree_autumn', sprite: 'tree_autumn', radius: 11, weight: 4, tall: true },
  { id: 'tree_gold', sprite: 'tree_gold', radius: 11, weight: 2, tall: true },
  { id: 'tree_blossom', sprite: 'tree_blossom', radius: 12, weight: 2, tall: true },
  { id: 'tree_blossom2', sprite: 'tree_blossom2', radius: 12, weight: 1, tall: true },
  { id: 'tree_dead', sprite: 'tree_dead', radius: 7, weight: 3, tall: true },
  // Low things: nothing to hide behind, still in the way.
  { id: 'stump', sprite: 'stump', radius: 11, weight: 4, tall: false },
  { id: 'stump_flowers', sprite: 'stump_flowers', radius: 11, weight: 2, tall: false },
  { id: 'stump_shrooms', sprite: 'stump_shrooms', radius: 11, weight: 2, tall: false },
  { id: 'log', sprite: 'log', radius: 16, weight: 3, tall: false },
  { id: 'spire', sprite: 'spire', radius: 5, weight: 2, tall: false },
  { id: 'spires', sprite: 'spires', radius: 7, weight: 2, tall: false },
]

/**
 * The shop camp, laid out around the shop: offsets from its centre in world
 * units. Solid pieces (radius > 0) block like any obstacle; the rest are
 * dressing. The chest and shopkeeper are drawn separately, because they move.
 */
export const CAMP_LAYOUT: { sprite: string; dx: number; dy: number; radius: number }[] = [
  { sprite: 'tent', dx: 0, dy: -8, radius: 26 },
  { sprite: 'campfire_logs', dx: -58, dy: 30, radius: 12 },
  { sprite: 'barrel', dx: 44, dy: 2, radius: 8 },
  { sprite: 'barrel_apples', dx: 58, dy: 12, radius: 8 },
  { sprite: 'crates', dx: 50, dy: -18, radius: 9 },
  { sprite: 'sack', dx: -40, dy: -4, radius: 0 },
]
