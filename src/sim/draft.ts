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

type Entry = { offer: Offer; weight: number }

/** Whether an upgrade belongs to a slot's theme, by its tags. */
function fitsTheme(entry: Entry, theme: string): boolean {
  const tags = (config.draft.slotThemes as Record<string, string[]>)[theme]
  if (!tags) return true
  return entry.offer.def.tags.some((tag) => tags.includes(tag))
}

/** One weighted pick from `entries`, removed from `pool` so it can't repeat. */
function pickWeighted(world: World, pool: Entry[], entries: Entry[]): Offer {
  let total = 0
  for (const entry of entries) total += entry.weight

  let cursor = world.draftRng() * total
  let chosen = entries[entries.length - 1]
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) {
      chosen = entry
      break
    }
  }

  pool.splice(pool.indexOf(chosen), 1)
  return chosen.offer
}

/**
 * Deal the cards, left to right, one per slot.
 *
 * Each slot leans towards a theme (`draft.slots`, `draft.slotThemes`): the
 * left one towards fighting and surviving, the right one towards comfort —
 * XP, gold, reach, speed — and the middle towards nothing. So each level-up
 * asks a readable question: do I need more power, or can I afford comfort?
 *
 * A lean, not a rule: a slot keeps to its theme with `draft.slotBias`
 * probability, otherwise it draws from everything. And a theme that has run
 * dry — every comfort upgrade maxed out — quietly draws from everything too.
 */
function buildOffers(world: World): Offer[] {
  const pool = candidates(world)
  const chosen: Offer[] = []
  const wanted = Math.min(Math.max(1, Math.round(config.draft.choices)), pool.length)

  for (let slot = 0; slot < wanted; slot++) {
    const theme = config.draft.slots[slot] ?? 'any'
    // Rolled every time, even when there's no theme, so the random stream
    // doesn't shift depending on which slots have one.
    const leans = world.draftRng() < config.draft.slotBias
    const themed = leans ? pool.filter((entry) => fitsTheme(entry, theme)) : pool
    chosen.push(pickWeighted(world, pool, themed.length > 0 ? themed : pool))
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
