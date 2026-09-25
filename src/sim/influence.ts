import { config } from '../config'
import { InfluenceMap, type LayerSettings } from './influenceMap'
import { pickupPull } from './pickupTiers'
import { forEachObstacleNear } from './obstacles'
import { auraRadius, isAura, zealOf } from './auras'
import { weaponStat } from './stats'
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

  // Danger counts for more the more hurt he is — see influence.hurtFear.
  const missing = 1 - character.hp / Math.max(1, character.maxHp)
  // Zeal: with an aura to burn them in, he's less afraid of letting them close.
  const fear = (1 + config.influence.hurtFear * missing) * (1 - zealOf(world))

  // Flagged as hazard so the flow pass knows where the walls are.
  for (const enemy of world.enemies) {
    influenceMap.stamp(layers.enemyDanger, enemy.x, enemy.y, enemy.def.dangerWeight * fear, true)
  }

  // An aura wants enemies in it — but not right on top of him. For every
  // enemy, the ring of spots where standing would put it between the aura's
  // safe bubble (aura.bubble of its radius) and its edge; summed, each cell
  // says how many enemies would be burning there. Only while farming, so it
  // never pulls against a trip to the shop.
  // Keen only while he's healthy: the pull fades as he's hurt and is gone
  // below aura.engageBelow, so a mauling sends him away to recover rather
  // than deeper in. Without that, plain Righteous Fire walked him into
  // crowds it couldn't kill and every run died.
  const health = character.hp / Math.max(1, character.maxHp)
  const keen = Math.max(0, (health - config.aura.engageBelow) / (1 - config.aura.engageBelow))
  if (world.intent === 'farming' && keen > 0) {
    for (const weapon of world.weapons) {
      if (!weapon.def.enabled || !isAura(weapon)) continue
      const engage = weaponStat(world, weapon, 'engage')
      if (engage <= 0) continue
      const outer = auraRadius(world, weapon)
      const inner = outer * config.aura.bubble
      const amount = engage * config.aura.engageWeight * keen
      for (const enemy of world.enemies) influenceMap.stampRing(enemy.x, enemy.y, inner, outer, amount)
    }
  }

  // Danger that belongs to a place rather than to whoever's standing on it:
  // gas on the ground, a lit fuse about to go, the lane a boar is about to
  // run down. Stamped as hazard too, so the flow routes round them.
  const { hazardFear } = config.influence
  const danger = layers.enemyDanger
  for (const hazard of world.hazards) {
    influenceMap.stamp({ ...danger, radius: hazard.radius + danger.radius * 0.5 }, hazard.x, hazard.y, hazardFear * fear, true)
  }
  for (const enemy of world.enemies) {
    const { fuse, charge } = enemy.def
    if (fuse && enemy.fuseLeft !== undefined && enemy.hp > 0) {
      influenceMap.stamp({ ...danger, radius: fuse.radius + danger.radius * 0.5 }, enemy.x, enemy.y, hazardFear * fear, true)
    }
    if (charge && (enemy.mode === 'windup' || enemy.mode === 'charge')) {
      const run = enemy.mode === 'charge' ? (enemy.modeTime ?? 0) * charge.speed : charge.distance
      for (let k = 1; k <= 4; k++) {
        const along = (run * k) / 4
        influenceMap.stamp(danger, enemy.x + (enemy.dirX ?? 0) * along, enemy.y + (enemy.dirY ?? 0) * along, hazardFear * 0.6 * fear, true)
      }
    }
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

  // Obstacles: walls to the flow, and a short push away up close so the
  // steering probes don't aim him at a trunk. The whole grid's worth.
  const gridReach = config.influence.gridRadiusCells * config.influence.cellSize
  forEachObstacleNear(world, character.x, character.y, gridReach, (obstacle) => {
    if (obstacle.radius <= 0) return
    influenceMap.block(obstacle.x, obstacle.y, obstacle.radius + character.radius)
    influenceMap.stamp(
      { ...layers.obstacle, radius: obstacle.radius + layers.obstacle.radius },
      obstacle.x,
      obstacle.y,
    )
  })

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
