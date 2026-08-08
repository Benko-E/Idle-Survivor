import type { PickupDef } from './types'

/**
 * Things enemies leave on the ground. (spec 5.1)
 *
 * Three tiers of XP globe, which is enough to prove the tier machinery works
 * without pretending to be a real economy. Gold, health and anything else
 * later are entries here plus a line in whichever enemy drops them — the
 * collection code never learns what any of them are, it reads `xp` and
 * `influenceWeight` off the definition.
 */
export const PICKUP_DEFS: PickupDef[] = [
  {
    id: 'pickup_xp_minor_01',
    displayName: 'Spark',
    tags: ['pickup', 'xp'],
    xp: 1,
    influenceWeight: 1,
    colour: '#4fd6e8',
    size: 9,
  },
  {
    id: 'pickup_xp_greater_01',
    displayName: 'Ember of Insight',
    tags: ['pickup', 'xp'],
    xp: 5,
    // Pulls harder than a Spark, but nowhere near five times harder. Value and
    // attractiveness are tuned independently on purpose.
    influenceWeight: 1.9,
    colour: '#7dffc4',
    size: 12,
  },
  {
    id: 'pickup_xp_grand_01',
    displayName: 'Soulglass',
    tags: ['pickup', 'xp', 'rare'],
    xp: 20,
    influenceWeight: 3.4,
    colour: '#c98dff',
    size: 15,
  },
]

export function findPickupDef(id: string): PickupDef {
  const def = PICKUP_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No pickup definition with id "${id}"`)
  return def
}
