import { config } from '../config'
import { InfluenceMap, type LayerSettings } from './influenceMap'
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

  for (const pickup of world.pickups) {
    influenceMap.stamp('pickupValue', layers.pickupValue, pickup.x, pickup.y, 1)
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
