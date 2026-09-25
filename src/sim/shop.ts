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
 *
 * And if he happens to be passing close by with a fair amount on him, he
 * pops in without waiting to be full: see passingBy.
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

  const { maxEagerness, passingEagerness } = config.shop
  // A pop-in is a short hop, but only if he actually makes it.
  if (world.passingBy) return passingEagerness
  // At least 1, so committing has real force even at exactly the threshold.
  return Math.min(maxEagerness, Math.max(1, world.gold / bankThreshold(world)))
}

/**
 * How much he carries before heading to the shop: at least
 * `shop.spendThreshold`, and more as he earns faster — about
 * `shop.thresholdMinutes` of his income. A fixed amount meant that the richer
 * a build got, the more of the run he spent walking to the shop with his
 * eye off the gold: with Righteous Fire's full kit, 41% of it.
 *
 * And more while he's doing well: up to `shop.confidentMinutes` of income
 * when he's healthy, so a fight that's going his way isn't abandoned for a
 * walk. Hurt, he banks what he has while he still can.
 */
export function bankThreshold(world: World): number {
  const { spendThreshold, thresholdMinutes, confidentMinutes } = config.shop
  if (thresholdMinutes <= 0 || world.time < 60) return spendThreshold
  const perMinute = world.goldEarned / (world.time / 60)
  const minutes = thresholdMinutes + Math.max(0, confidentMinutes - thresholdMinutes) * confidence(world)
  return Math.max(spendThreshold, perMinute * minutes)
}

/** 1 when he's healthy, 0 when he's hurt: see shop.confidentAbove / nervousBelow. */
export function confidence(world: World): number {
  const c = world.character
  const health = c.hp / Math.max(1, c.maxHp)
  const { confidentAbove, nervousBelow } = config.shop
  return Math.max(0, Math.min(1, (health - nervousBelow) / Math.max(1e-6, confidentAbove - nervousBelow)))
}

/**
 * Worth popping in on the way past: the shop is close (`shop.passingDistance`)
 * and he's carrying at least `shop.passingShare` of what would send him on a
 * trip. With the thresholds high enough that he farms for minutes at a time,
 * this is what keeps a death from costing all of it — without ever pulling
 * him further than a short detour.
 */
function passingBy(world: World, threshold: number): boolean {
  const { passingDistance, passingShare } = config.shop
  if (passingDistance <= 0 || world.gold <= 0 || world.gold < threshold * passingShare) return false
  return distanceToShop(world) <= passingDistance
}

export function distanceToShop(world: World): number {
  return Math.hypot(world.shopX - world.character.x, world.shopY - world.character.y)
}

/**
 * The two-state loop: farm until full — or until passing close by with a
 * fair amount — walk to the shop, bank, farm again.
 *
 * Deliberately the whole of the "decision making" in the game, and
 * deliberately this boring. Everything about *how* he gets anywhere is still
 * emergent from the influence field; this only decides what he's currently
 * trying to do.
 */
export function updateShop(world: World): void {
  if (!config.shop.enabled) return

  if (world.intent === 'farming') {
    const threshold = bankThreshold(world)
    if (world.gold >= threshold) {
      world.intent = 'banking'
      world.passingBy = false
    } else if (passingBy(world, threshold)) {
      world.intent = 'banking'
      world.passingBy = true
    }
    return
  }

  const distance = distanceToShop(world)
  // Full on the way in: it's a real trip now, and those aren't given up.
  if (world.passingBy && world.gold >= bankThreshold(world)) world.passingBy = false
  // A pop-in the crowd has pushed him well away from: not on the way any more.
  if (world.passingBy && distance > config.shop.passingDistance * config.shop.passingGiveUp) {
    world.intent = 'farming'
    world.passingBy = false
    return
  }
  if (distance > config.shop.radius) return

  const amount = world.gold
  world.intent = 'farming'
  world.bankedThisRun += amount
  world.gold = 0
  world.shopVisits++
  if (world.passingBy) world.passingVisits++
  world.passingBy = false
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
