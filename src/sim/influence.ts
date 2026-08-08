import { config } from '../config'
import { InfluenceMap, type LayerSettings } from './influenceMap'
import { pickupPull } from './pickupTiers'
import type { World } from './world'

/**
 * Fills the influence map from the current state of the world.
 *
 * This is the only file that knows which layer corresponds to which kind of
 * thing. The map itself doesn't, and the movement code doesn't either — it
 * just walks uphill on whatever total this produces.
 *
 * Adding a layer later (gold, health, hazards) is one config entry plus one
 * loop below. Nothing else in the game changes.
 */

// Derived state, rebuilt from scratch on every update — not game state, which
// is why it can live here rather than on the world.
export const influenceMap = new InfluenceMap(config.influence.cellSize, config.influence.gridRadiusCells)

/** Time since the last rebuild, for the update-rate throttle. */
let sinceLastUpdate = Infinity

export function resetInfluenceClock(): void {
  sinceLastUpdate = Infinity
}

function rebuild(world: World): void {
  const layers = config.influence.layers as Record<string, LayerSettings>
  const character = world.character

  influenceMap.beginUpdate(character.x, character.y)

  for (const enemy of world.enemies) {
    influenceMap.stamp('enemyDanger', layers.enemyDanger, enemy.x, enemy.y, enemy.def.dangerWeight)
  }

  // Two layers per pickup, saying different things.
  //
  // The wide one is "there is loot roughly over that way" — it has to reach
  // further than he can see, or he never learns there's a reason to move.
  // But spread thin over hundreds of units and summed across twenty globes,
  // it's nearly flat where he's standing, so a single nearby globe is a
  // rounding error in it. He would walk straight past collectable pickups.
  //
  // The near one fixes exactly that: a small, steep spike right on the globe,
  // steep enough to beat the heading bonus that otherwise keeps him going in
  // a straight line. "Something good is two steps to your left."
  //
  // Note what this needed: two config entries and one extra line. No changes
  // to the map, the sampling, or anything that decides where he walks.
  for (const pickup of world.pickups) {
    const pull = pickupPull(pickup)
    influenceMap.stamp('pickupWide', layers.pickupWide, pickup.x, pickup.y, pull)
    influenceMap.stamp('pickupNear', layers.pickupNear, pickup.x, pickup.y, pull)
  }
}

/**
 * The map does not need to be rebuilt every frame — the spec allows throttling
 * it, and at high enemy counts it's the most expensive thing in the sim.
 *
 * The cost of throttling is staleness: between rebuilds the character is
 * steering around where the swarm *was*. The steering itself still samples
 * every frame, so movement stays smooth; only the information ages. If he ever
 * looks like he's walking into enemies he should have seen, raise updateHz
 * before touching any of the weights.
 */
export function updateInfluence(world: World, dt: number): void {
  sinceLastUpdate += dt
  const interval = 1 / config.influence.updateHz
  if (sinceLastUpdate < interval) return

  sinceLastUpdate = 0
  rebuild(world)
}
