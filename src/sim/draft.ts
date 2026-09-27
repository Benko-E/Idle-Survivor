import { config, type DraftBreakpoint } from '../config'
import type { UpgradeDef } from '../data/types'
import { UPGRADE_DEFS } from '../data/upgrades'
import type { Modifier } from '../core/modifiers'
import { spellTags } from './stats'
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

/**
 * The level the waiting draft belongs to. Levels can be saved up and are
 * spent oldest first, so at level 14 with three waiting, the next card is
 * level 12's. Gaining another level before choosing doesn't change it.
 */
export function draftLevel(world: World): number {
  return world.level - Math.max(0, world.pendingLevelUps - 1)
}

/** The breakpoint the waiting draft falls on, if any (`draft.breakpoints`). */
export function draftBreakpoint(world: World): DraftBreakpoint | null {
  const level = draftLevel(world)
  for (const breakpoint of Object.values(config.draft.breakpoints)) {
    if (Math.round(breakpoint.level) === level) return breakpoint
  }
  return null
}

/** His spell of a tier, the one a `spellTier` breakpoint is about. */
export function spellOfTier(world: World, tier: number): string | undefined {
  return world.weapons.find((weapon) => weapon.def.tier === tier)?.def.id
}

/** Whether a breakpoint narrows the cards at all, rather than only adding some. */
function hasFocus(breakpoint: DraftBreakpoint): boolean {
  return Boolean(breakpoint.kind) || (breakpoint.spellTier ?? 0) > 0
}

function inFocus(world: World, def: UpgradeDef, breakpoint: DraftBreakpoint): boolean {
  if (breakpoint.kind && def.kind !== breakpoint.kind) return false
  if ((breakpoint.spellTier ?? 0) > 0) {
    const spellId = spellOfTier(world, Math.round(breakpoint.spellTier!))
    if (!spellId || def.spellId !== spellId) return false
  }
  return true
}

/** How many cards the waiting draft deals: the usual, this run's extra, and the breakpoint's. */
export function cardsThisLevel(world: World): number {
  const extra = draftBreakpoint(world)?.extraCards ?? 0
  return Math.max(1, Math.round(config.draft.choices + world.extraCards + extra))
}

/** The other half of an either-or pair, if it has one. */
export function partnerOf(def: UpgradeDef): UpgradeDef | undefined {
  if (def.pairedWith) return UPGRADE_DEFS.find((other) => other.id === def.pairedWith)
  return UPGRADE_DEFS.find((other) => other.pairedWith === def.id)
}

function ownsTag(world: World, tag: string): boolean {
  return world.weapons.some((weapon) => spellTags(world, weapon).includes(tag))
}

/** Whether any taken upgrade has retired this one, or its partner has been taken. */
function retired(world: World, def: UpgradeDef): boolean {
  for (const taken of Object.keys(world.upgradesTaken)) {
    if (UPGRADE_DEFS.find((other) => other.id === taken)?.retires?.includes(def.id)) return true
  }
  const partner = partnerOf(def)
  return partner !== undefined && (world.upgradesTaken[partner.id] ?? 0) > 0
}

/** Whether one of this spell's evolutions has already been taken. */
function evolved(world: World, spellId: string): boolean {
  return UPGRADE_DEFS.some((def) => def.kind === 'evolution' && def.spellId === spellId && (world.upgradesTaken[def.id] ?? 0) > 0)
}

/** Whether an upgrade could be offered right now. Exported for the tests. */
export function upgradeIsEligible(world: World, def: UpgradeDef): boolean {
  if ((world.upgradesTaken[def.id] ?? 0) >= def.maxStacks) return false
  if (def.spellId && !world.weapons.some((weapon) => weapon.def.id === def.spellId)) return false
  if (def.requires && !def.requires.every((id) => (world.upgradesTaken[id] ?? 0) > 0)) return false
  if (retired(world, def)) return false
  if (def.kind === 'evolution') {
    if (draftLevel(world) < config.draft.evolutionLevel) return false
    if (def.spellId && evolved(world, def.spellId)) return false
  }
  if (def.classIds && !def.classIds.includes(world.classDef.id)) return false
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

/**
 * What a card slot leans towards, with `count` cards dealt. The first and
 * last cards keep the first and last of `draft.slots` however many cards
 * there are, so the right-hand card still leans to comfort with five; the
 * cards between take the middle slots in turn, then lean nowhere.
 */
function slotTheme(slot: number, count: number): string {
  const slots = config.draft.slots
  if (count > 1 && slot === count - 1) return slots[slots.length - 1] ?? 'any'
  return slot < slots.length - 1 ? slots[slot] : 'any'
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

/** The entry in the pool for this card's either-or partner, if it's there to be dealt. */
function partnerEntry(pool: Entry[], def: UpgradeDef): Entry | undefined {
  const partner = partnerOf(def)
  return partner ? pool.find((entry) => entry.offer.def === partner) : undefined
}

/**
 * Deal one card from `entries` into the hand. A card with an either-or
 * partner brings it along, the two side by side in data order, so a pair is
 * only drawn when there's room left for both. False if nothing fits.
 */
function deal(world: World, pool: Entry[], entries: Entry[], hand: Offer[], wanted: number): boolean {
  const room = wanted - hand.length
  // A plain filter when there are no pairs about, so the random stream is
  // exactly what it was before pairs existed.
  const fits = room >= 2 ? entries : entries.filter((entry) => !partnerEntry(pool, entry.offer.def))
  if (fits.length === 0) return false

  const offer = pickWeighted(world, pool, fits)
  const partner = partnerEntry(pool, offer.def)
  if (!partner) {
    hand.push(offer)
    return true
  }
  pool.splice(pool.indexOf(partner), 1)
  const first = UPGRADE_DEFS.indexOf(offer.def) < UPGRADE_DEFS.indexOf(partner.offer.def)
  hand.push(...(first ? [offer, partner.offer] : [partner.offer, offer]))
  return true
}

/**
 * Deal the cards, left to right.
 *
 * On a breakpoint level (`draft.breakpoints`) the focus goes first: every
 * card it can fill comes from it. Otherwise, and for whatever a focus leaves
 * over, each of his spells gets a card, then each remaining slot leans
 * towards a theme (`draft.slots`, `draft.slotThemes`): the left one towards
 * fighting and surviving, the right one towards comfort — XP, gold, reach,
 * speed — and those between towards nothing. So each level-up asks a
 * readable question: do I need more power, or can I afford comfort?
 *
 * A lean, not a rule: a slot keeps to its theme with `draft.slotBias`
 * probability, otherwise it draws from everything. And a theme that has run
 * dry — every comfort upgrade maxed out — quietly draws from everything too.
 */
function buildOffers(world: World): Offer[] {
  const pool = candidates(world)
  const hand: Offer[] = []
  const wanted = Math.min(cardsThisLevel(world), pool.length)

  const breakpoint = draftBreakpoint(world)
  if (breakpoint && hasFocus(breakpoint)) {
    while (hand.length < wanted) {
      const focused = pool.filter((entry) => inFocus(world, entry.offer.def, breakpoint))
      if (!deal(world, pool, focused, hand, wanted)) break
    }
  }

  // A card for each of his spells first, while it has an upgrade to offer:
  // three picks of health and speed while Firebolt waits for Pierce was the
  // draft at its most frustrating. `draft.openSlots` stay free for anything,
  // so there's always room for comfort too; with more spells than reserved
  // cards, which spells get one this level is shuffled.
  const reserved = Math.max(0, wanted - Math.max(0, Math.round(config.draft.openSlots)))
  const spells = world.weapons.map((weapon) => weapon.def.id)
  for (let i = spells.length - 1; i > 0; i--) {
    const j = Math.floor(world.draftRng() * (i + 1))
    ;[spells[i], spells[j]] = [spells[j], spells[i]]
  }
  for (const spellId of spells) {
    if (hand.length >= reserved) break
    // Already has one, from a breakpoint's focus.
    if (hand.some((offer) => offer.def.spellId === spellId)) continue
    const forSpell = pool.filter((entry) => entry.offer.def.spellId === spellId)
    // Room counted against every card, not just the reserved ones: a pair is
    // one choice, even if it takes the free card's place beside it.
    if (forSpell.length > 0) deal(world, pool, forSpell, hand, wanted)
  }

  while (hand.length < wanted) {
    const theme = slotTheme(hand.length, wanted)
    // Rolled every time, even when there's no theme, so the random stream
    // doesn't shift depending on which slots have one.
    const leans = world.draftRng() < config.draft.slotBias
    const themed = leans ? pool.filter((entry) => fitsTheme(entry, theme)) : pool
    if (deal(world, pool, themed.length > 0 ? themed : pool, hand, wanted)) continue
    // Only pairs left in the theme with one slot to go: anything else will do.
    if (!deal(world, pool, pool, hand, wanted)) break
  }

  return hand
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

  applyUpgrade(world, offer.def)

  world.pendingLevelUps = Math.max(0, world.pendingLevelUps - 1)
}

/**
 * The modifiers an upgrade adds, as they go into play: an upgrade for one
 * spell has each of its modifiers narrowed to that spell's id, so they reach
 * it and nothing else.
 */
export function upgradeModifiers(def: UpgradeDef): Modifier[] {
  if (!def.spellId) return def.modifiers
  return def.modifiers.map((modifier) => ({ ...modifier, tags: [...(modifier.tags ?? []), def.spellId!] }))
}

/** What taking an upgrade does to the world: its modifiers, its count, its keywords. */
export function applyUpgrade(world: World, def: UpgradeDef): void {
  world.modifiers.push(...upgradeModifiers(def))
  world.upgradesTaken[def.id] = (world.upgradesTaken[def.id] ?? 0) + 1
  const spellId = def.spellId
  if (spellId && def.grantsTags) {
    const granted = (world.grantedTags[spellId] ??= [])
    for (const tag of def.grantsTags) if (!granted.includes(tag)) granted.push(tag)
  }
}
