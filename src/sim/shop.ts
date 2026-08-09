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
 * Zero while farming, full once he's committed to the trip.
 *
 * This used to be a continuous ramp, with the shop and the globes bidding
 * against each other every frame — and it was tuned for a long time without
 * ever working properly. He'd sit on 219 against a threshold of 60, still
 * weighing "one more globe" against a 476 unit walk, forever, because a
 * decent cluster underfoot always outbids a trip.
 *
 * Committing is a goal, not a preference. Once he decides to bank, he banks.
 * The spec's rule against hand-written behaviours is about *movement* — don't
 * write separate kiting and fleeing code — and this isn't that: it flips
 * layer weights, which is precisely the mechanism the focus buttons will use.
 */
export function shopEagerness(world: World): number {
  if (!config.shop.enabled) return 0
  if (world.intent !== 'banking') return 0

  const { spendThreshold, maxEagerness } = config.shop
  // At least 1, so committing has real force even at exactly the threshold.
  return Math.min(maxEagerness, Math.max(1, world.gold / spendThreshold))
}

export function distanceToShop(world: World): number {
  return Math.hypot(world.shopX - world.character.x, world.shopY - world.character.y)
}

/**
 * The two-state loop: farm until full, walk to the shop, spend, farm again.
 *
 * Deliberately the whole of the "decision making" in the game, and
 * deliberately this boring. Everything about *how* he gets anywhere is still
 * emergent from the influence field; this only decides what he's currently
 * trying to do.
 */
export function updateShop(world: World): void {
  if (!config.shop.enabled) return

  if (world.intent === 'farming') {
    if (world.gold >= config.shop.spendThreshold) world.intent = 'banking'
    return
  }

  if (distanceToShop(world) > config.shop.radius) return

  world.intent = 'farming'
  world.spentAtShop += world.gold
  world.gold = 0
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
