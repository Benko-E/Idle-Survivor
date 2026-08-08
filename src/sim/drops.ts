import { config } from '../config'
import { findPickupDef } from '../data/pickups'
import type { Enemy, World } from './world'

/**
 * What a dead enemy leaves behind.
 *
 * The drop table lives on the enemy's data entry and the roll happens here, so
 * "Hulks should drop the good stuff more often" is a number in a data file and
 * "XP drops too often across the board" is one number in the config.
 */
export function rollDrops(world: World, enemy: Enemy): void {
  if (world.pickups.length >= config.pickups.maxAlive) return

  const scale = config.drops.chanceScale

  // First success wins. Tables are written best-first, so a Hulk rolls for
  // Soulglass, then an Ember, and only falls through to a Spark if both miss.
  for (const entry of enemy.def.drops) {
    if (world.rng() >= entry.chance * scale) continue

    world.pickups.push({
      def: findPickupDef(entry.pickupId),
      tier: entry.tier ?? 0,
      x: enemy.x,
      y: enemy.y,
      wasNear: false,
    })
    return
  }
}
