import { config } from '../config'
import { gameEvents } from './events'
import type { World } from './world'

/**
 * The shop, where carried gold becomes banked gold.
 *
 * Gold in his pocket dies with him; gold deposited here is kept between runs
 * (the save file listens for the `banked` event — see meta/profile.ts). That
 * makes every trip a wager: bank now and be safe, or keep farming and risk it.
 *
 * He accumulates carried gold, and once it crosses a threshold the shop starts
 * pulling on him; arriving deposits it all and the pull switches off, at which point the loot he abandoned becomes the most
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

  const { maxEagerness } = config.shop
  // At least 1, so committing has real force even at exactly the threshold.
  return Math.min(maxEagerness, Math.max(1, world.gold / bankThreshold(world)))
}

/**
 * How much he carries before heading to the shop: at least
 * `shop.spendThreshold`, and more as he earns faster — about
 * `shop.thresholdMinutes` of his income. A fixed amount meant that the richer
 * a build got, the more of the run he spent walking to the shop with his
 * eye off the gold: with Righteous Fire's full kit, 41% of it.
 */
export function bankThreshold(world: World): number {
  const { spendThreshold, thresholdMinutes } = config.shop
  if (thresholdMinutes <= 0 || world.time < 60) return spendThreshold
  const perMinute = world.goldEarned / (world.time / 60)
  return Math.max(spendThreshold, perMinute * thresholdMinutes)
}

export function distanceToShop(world: World): number {
  return Math.hypot(world.shopX - world.character.x, world.shopY - world.character.y)
}

/**
 * The two-state loop: farm until full, walk to the shop, bank, farm again.
 *
 * Deliberately the whole of the "decision making" in the game, and
 * deliberately this boring. Everything about *how* he gets anywhere is still
 * emergent from the influence field; this only decides what he's currently
 * trying to do.
 */
export function updateShop(world: World): void {
  if (!config.shop.enabled) return

  if (world.intent === 'farming') {
    if (world.gold >= bankThreshold(world)) world.intent = 'banking'
    return
  }

  if (distanceToShop(world) > config.shop.radius) return

  const amount = world.gold
  world.intent = 'farming'
  world.bankedThisRun += amount
  world.gold = 0
  world.shopVisits++
  gameEvents.emit('banked', { amount })

  // Move it somewhere new, measured from where he is now.
  //
  // A fixed shop just becomes the next campsite: at a low threshold he tops up
  // in seconds and never leaves its neighbourhood — measured at 3 visits with
  // his distance to it never exceeding 581. Relocating means every visit ends
  // with a fresh destination somewhere else, so the loop is farm, travel,
  // bank, travel again.
  const angle = world.rng() * Math.PI * 2
  world.shopX = world.character.x + Math.cos(angle) * config.shop.distanceFromStart
  world.shopY = world.character.y + Math.sin(angle) * config.shop.distanceFromStart
}
