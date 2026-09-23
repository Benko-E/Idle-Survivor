import { config } from '../config'
import type { UpgradeDef } from '../data/types'
import { UPGRADE_DEFS } from '../data/upgrades'
import type { World } from './world'

/**
 * What the level-up draft offers, and what taking it does. (spec 4)
 *
 * All the selection logic lives here — eligibility, weighting, exclusions —
 * because the spec is explicit that it will get more complicated and should
 * only ever need changing in one place.
 *
 * Offers are rolled the first time the panel opens for a level, then frozen
 * until one is taken. Rolling them fresh on every open meant "later" followed
 * by reopening was a free reroll, as many times as you liked — which turns
 * every choice into a search for the best card rather than a decision.
 *
 * They also draw from their own random stream, never the simulation's. When
 * they shared one, merely *opening* the draft consumed numbers the spawner
 * would otherwise have used, so identical seeds diverged depending on when you
 * happened to click — and a fixed seed is the whole basis of before/after
 * tuning measurements.
 */

/**
 * A card in the draft. Always an upgrade now: new spells come from the tier
 * choices in sim/spellTiers.ts, never from an ordinary level-up.
 */
export type Offer = { kind: 'upgrade'; id: string; displayName: string; description: string; def: UpgradeDef }

function ownsTag(world: World, tag: string): boolean {
  return world.weapons.some((weapon) => weapon.def.tags.includes(tag))
}

function upgradeIsEligible(world: World, def: UpgradeDef): boolean {
  if ((world.upgradesTaken[def.id] ?? 0) >= def.maxStacks) return false
  if (!def.requiresOwnedTags) return true
  return def.requiresOwnedTags.every((tag) => ownsTag(world, tag))
}

function candidates(world: World): { offer: Offer; weight: number }[] {
  const pool: { offer: Offer; weight: number }[] = []

  for (const def of UPGRADE_DEFS) {
    if (!upgradeIsEligible(world, def)) continue
    pool.push({
      offer: { kind: 'upgrade', id: def.id, displayName: def.displayName, description: def.description, def },
      weight: def.weight,
    })
  }

  return pool
}

/** Weighted pick without replacement, so one draft never repeats an option. */
function buildOffers(world: World): Offer[] {
  const pool = candidates(world)
  const chosen: Offer[] = []
  const wanted = Math.min(Math.max(1, Math.round(config.draft.choices)), pool.length)

  while (chosen.length < wanted) {
    let total = 0
    for (const entry of pool) total += entry.weight

    let cursor = world.draftRng() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      cursor -= pool[i].weight
      if (cursor <= 0) {
        index = i
        break
      }
    }

    chosen.push(pool[index].offer)
    pool.splice(index, 1)
  }

  return chosen
}

/**
 * The offers for the level currently waiting to be spent.
 *
 * Rolled once and remembered on the world, so closing and reopening the panel
 * shows the same cards. An empty roll isn't remembered: nothing is eligible
 * right now, and caching that would leave the level stuck forever.
 */
export function currentOffers(world: World): Offer[] {
  if (world.draftOffers) return world.draftOffers
  const offers = buildOffers(world)
  if (offers.length > 0) world.draftOffers = offers
  return offers
}

/**
 * Taking an offer. Two lines of actual work, which is the whole point of
 * having built the modifier system three steps early.
 */
export function takeOffer(world: World, offer: Offer): void {
  // Only an offer from the current roll can be taken. Guards against a stale
  // card from a previous run being clicked after an auto-restart, and against
  // a double click spending two levels on one card.
  if (!world.draftOffers?.includes(offer)) return
  world.draftOffers = null

  world.modifiers.push(...offer.def.modifiers)
  world.upgradesTaken[offer.id] = (world.upgradesTaken[offer.id] ?? 0) + 1

  world.pendingLevelUps = Math.max(0, world.pendingLevelUps - 1)
}
