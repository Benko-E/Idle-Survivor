import type { PickupDef } from './types'

/**
 * Kinds of pickup. (spec 5.1)
 *
 * These are *gold*, not experience. Gold drops, gets carried, and gets spent
 * at a shop; experience is awarded automatically on the kill and never lies
 * on the floor. They used to be the same number, which made the shop read
 * oddly — you don't hand your life experience to a merchant.
 *
 * One entry, because there is only one kind of thing on the ground so far.
 * The three sizes of globe that used to live here are gone — magnitude is now
 * a tier number on each instance, scaled by formulas in the config, so the
 * ladder goes up forever without anyone writing a rung.
 *
 * Gold, health and anything else later are entries here plus a line in
 * whichever enemy drops them.
 */
export const PICKUP_DEFS: PickupDef[] = [
  {
    id: 'pickup_gold_01',
    tags: ['pickup', 'gold'],
    baseGold: 1,
    basePull: 1,
    merges: true,
    baseSize: 9,
    // Deliberately *not* gold-coloured, despite being gold: the character is
    // a yellow rectangle, and amber coins next to him were indistinguishable
    // at a glance. Cool and dim at the bottom, hot and bright at the top, so
    // a big pile is obvious from across the screen. One data field to change
    // if real art makes it moot.
    tierColours: ['#4fd6e8', '#7dffc4', '#c98dff', '#ffd76b', '#ff9a4d', '#ff5c5c'],
    tierNames: ['Coin', 'Purse', 'Coffer', 'Hoard', 'Treasury'],
  },
]

export function findPickupDef(id: string): PickupDef {
  const def = PICKUP_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No pickup definition with id "${id}"`)
  return def
}
