import { config } from '../config'
import type { World } from './world'

/**
 * TEMPORARY SCAFFOLDING — see the note in config.shop.
 *
 * A destination. He accumulates carried value, and once it crosses a
 * threshold the shop starts pulling on him; arriving spends it all and the
 * pull switches off, at which point the loot he abandoned becomes the most
 * interesting thing in the world again and he heads back for it.
 *
 * The round trip is the point. Nothing here tells him to return — that falls
 * out of the shop going quiet and the globes still lying where he left them.
 */

/**
 * How badly he wants to go shopping, as a multiplier on the shop layer.
 *
 * Zero below the threshold, so he farms undisturbed, then climbs as his
 * pockets fill. This is the only "decision" in the feature and it is a
 * number, not a branch — exactly the shape the focus buttons in the spec
 * will take.
 */
export function shopEagerness(world: World): number {
  if (!config.shop.enabled) return 0

  const { spendThreshold, maxEagerness } = config.shop
  if (world.carried < spendThreshold) return 0

  return Math.min(maxEagerness, world.carried / spendThreshold)
}

export function distanceToShop(world: World): number {
  return Math.hypot(world.shopX - world.character.x, world.shopY - world.character.y)
}

/** Arriving spends everything he's carrying. There is nothing to buy yet. */
export function updateShop(world: World): void {
  if (!config.shop.enabled) return
  if (world.carried <= 0) return
  if (distanceToShop(world) > config.shop.radius) return

  world.spentAtShop += world.carried
  world.carried = 0
  world.shopVisits++

  // Move it somewhere new, measured from where he is now.
  //
  // A fixed shop just becomes the next campsite: at a low threshold he tops up
  // in seconds and never leaves its neighbourhood — measured at 3 visits with
  // his distance to it never exceeding 581. Relocating means every visit ends
  // with a fresh destination somewhere else, so the loop is farm, travel,
  // spend, travel again.
  const angle = world.rng() * Math.PI * 2
  world.shopX = world.character.x + Math.cos(angle) * config.shop.distanceFromStart
  world.shopY = world.character.y + Math.sin(angle) * config.shop.distanceFromStart
}
