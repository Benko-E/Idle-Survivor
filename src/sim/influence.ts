import { config } from '../config'
import { InfluenceMap, type LayerSettings } from './influenceMap'
import { pickupPull } from './pickupTiers'
import { distanceToShop, shopEagerness } from './shop'
import { markFreshness } from './trail'
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

  // Flagged as hazard so the flow pass knows where the walls are.
  for (const enemy of world.enemies) {
    influenceMap.stamp(layers.enemyDanger, enemy.x, enemy.y, enemy.def.dangerWeight, true)
  }

  // The pull of the shop, applied per cell rather than stamped: the shop is
  // usually well outside the grid, where a stamped blob would land nowhere.
  //
  // A constant slope towards it rather than a blob around it, so the pull is
  // identical whether it's 200 units away or 3000 — and it never silently
  // switches off at range. Measured against his own position, which keeps the
  // numbers small and readable on the heatmap without changing any difference
  // between cells, and differences are all that steering uses.
  const shopSlope = (layers.shop.weight * shopEagerness(world)) / config.shop.gradientLength
  if (shopSlope > 0) {
    const characterToShop = distanceToShop(world)
    influenceMap.addPerCell((x, y) => shopSlope * (characterToShop - Math.hypot(world.shopX - x, world.shopY - y)))
  }

  // Ground he has recently stood on, fading as it ages. Strength is the
  // mark's freshness, so a spot he left ten seconds ago barely registers.
  for (const mark of world.trail) {
    influenceMap.stamp(layers.staleness, mark.x, mark.y, markFreshness(world, mark))
  }

  // Each pickup says two things, through two different channels.
  //
  // "There is loot over that way" goes to the flow pass as a seed and nowhere
  // else, so it only reaches him along routes that go around danger. When it
  // was also stamped straight onto the map as a wide blob, it was felt along
  // the straight line through the middle of the pack, and that was most of
  // why he dived into mobs.
  //
  // "One is right here, take it" is a small, steep stamp on the pickup itself,
  // so something two steps to his left can win against the road he's on. It's
  // muted by any danger already stamped on that spot: loot drops where enemies
  // die, which is where the rest of them are still standing.
  //
  // While banking only the long-range signal is turned down. He should still
  // hoover up anything he passes on the way to the shop, just not detour.
  const lootScale = world.intent === 'banking' ? config.shop.bankingLootScale : 1
  const { pickupValue } = config.influence.flow
  const { guardFear } = config.influence

  for (const pickup of world.pickups) {
    const pull = pickupPull(pickup)
    influenceMap.seed(pickup.x, pickup.y, pickupValue * pull * lootScale)
    const guarded = 1 / (1 + influenceMap.hazardAt(pickup.x, pickup.y) * guardFear)
    influenceMap.stamp(layers.pickupNear, pickup.x, pickup.y, pull * guarded)
  }

  // Last, once every source is in place: flood the rewards outward so they
  // reach him around obstacles rather than through them.
  if (config.influence.flow.weight > 0) influenceMap.computeFlow()
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
