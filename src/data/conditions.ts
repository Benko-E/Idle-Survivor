import type { ConditionDef } from './types'

/**
 * The states an enemy can be in. (spec 5.1: content is data)
 *
 * Spells and upgrades apply these by id, and anything that cares whether an
 * enemy is burning — "burning enemies explode on death", "+30% damage to
 * frozen enemies" — asks by id too. Nothing anywhere else lists them.
 *
 * A new one is an entry here. Most states do one of the four jobs in
 * ConditionDef.effect, so "poisoned" is:
 *
 *   { id: 'poisoned', displayName: 'Poisoned', effect: 'damage',
 *     stacking: 'stack', maxStacks: 5, tint: '#7fd34e', tintStrength: 0.35 }
 *
 * and a spell that deals poison names it. Anything stranger than that — a
 * bleed that only hurts while the enemy is moving — gets a hook in
 * CONDITION_HOOKS (sim/statusEffects.ts) keyed by the same id; the entry here
 * stays as it is.
 */
export const CONDITION_DEFS: ConditionDef[] = [
  {
    id: 'burning',
    displayName: 'Burning',
    effect: 'damage',
    stacking: 'refresh',
    tint: '#ff7a2a',
    tintStrength: 0.35,
  },
  {
    id: 'chilled',
    displayName: 'Chilled',
    effect: 'slow',
    stacking: 'refresh',
    tint: '#8fd8ff',
    tintStrength: 0.42,
  },
  {
    id: 'frozen',
    displayName: 'Frozen',
    effect: 'hold',
    stacking: 'refresh',
    // Frozen, thawed, then two seconds before it can freeze again, so a crowd
    // can't be held still forever by something that keeps freezing it.
    immuneAfter: 2,
    tint: '#d8f4ff',
    tintStrength: 0.7,
  },
  {
    id: 'shocked',
    displayName: 'Shocked',
    // Strength is extra damage taken from every hit, as a fraction: 0.2 is +20%.
    effect: 'vulnerable',
    stacking: 'refresh',
    tint: '#c8a8ff',
    tintStrength: 0.35,
  },
  {
    id: 'rooted',
    displayName: 'Rooted',
    effect: 'hold',
    stacking: 'refresh',
    // Shown by a ring of roots at its feet rather than a tint.
    tint: '#6fcf5a',
    tintStrength: 0,
  },
  {
    id: 'withering',
    displayName: 'Withering',
    effect: 'damage',
    stacking: 'refresh',
    tint: '#9a6ad0',
    tintStrength: 0.3,
  },
]

/** A plain search, not a cached map: a handful of entries, and one added later is found too. */
export function findCondition(id: string): ConditionDef | undefined {
  return CONDITION_DEFS.find((def) => def.id === id)
}
