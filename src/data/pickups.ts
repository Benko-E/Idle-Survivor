import type { PickupDef } from './types'

/**
 * Kinds of pickup. (spec 5.1)
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
    id: 'pickup_xp_01',
    tags: ['pickup', 'xp'],
    baseXp: 1,
    basePull: 1,
    merges: true,
    baseSize: 9,
    // Cool and dim at the bottom, hot and bright at the top, so a big one is
    // obvious from across the screen. The last entry covers every tier above.
    tierColours: ['#4fd6e8', '#7dffc4', '#c98dff', '#ffd76b', '#ff9a4d', '#ff5c5c'],
    tierNames: ['Spark', 'Ember', 'Soulglass', 'Heartstone', 'Godshard'],
  },
]

export function findPickupDef(id: string): PickupDef {
  const def = PICKUP_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No pickup definition with id "${id}"`)
  return def
}
