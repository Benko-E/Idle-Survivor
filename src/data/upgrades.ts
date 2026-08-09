import type { UpgradeDef } from './types'

/**
 * Everything the draft can offer that isn't a new spell. (spec 5.5)
 *
 * Every entry is pure data. There is no code for any individual upgrade
 * anywhere — taking one appends its modifiers to the world's list and the
 * resolver that has been sitting in the stat path since step 3 does the rest.
 *
 * Note what the tag selectors buy: "+30% damage" and "+30% damage to fire
 * spells" differ by one field. Adding "+2 chain jumps to lightning spells"
 * later is an entry here and nothing else.
 */
export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: 'up_damage_01',
    displayName: 'Focused Will',
    description: '+15% spell damage',
    tags: ['offence'],
    modifiers: [{ target: 'damage', op: 'increase', value: 0.15 }],
    maxStacks: 6,
    weight: 100,
  },
  {
    id: 'up_haste_01',
    displayName: 'Quickened Casting',
    description: '12% faster casting',
    tags: ['offence'],
    // Cooldown is a duration, so "faster" is a negative increase.
    modifiers: [{ target: 'cooldown', op: 'increase', value: -0.12 }],
    maxStacks: 5,
    weight: 90,
  },
  {
    id: 'up_area_01',
    displayName: 'Widened Sigils',
    description: '+25% area of effect',
    tags: ['offence', 'area'],
    modifiers: [{ target: 'area', op: 'increase', value: 0.25 }],
    maxStacks: 4,
    weight: 70,
    requiresOwnedTags: ['area'],
  },
  {
    id: 'up_multishot_01',
    displayName: 'Splitting Bolt',
    description: '+1 projectile',
    tags: ['offence', 'projectile'],
    modifiers: [{ target: 'count', op: 'add', value: 1, tags: ['projectile'] }],
    maxStacks: 3,
    weight: 55,
    requiresOwnedTags: ['projectile'],
  },
  {
    id: 'up_chain_01',
    displayName: 'Forked Arc',
    description: '+1 chain jump',
    tags: ['offence', 'lightning'],
    modifiers: [{ target: 'count', op: 'add', value: 1, tags: ['chain'] }],
    maxStacks: 3,
    weight: 55,
    requiresOwnedTags: ['chain'],
  },
  {
    id: 'up_fire_01',
    displayName: 'Kindled Fury',
    description: '+30% damage with fire spells',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'damage', op: 'increase', value: 0.3, tags: ['fire'] }],
    maxStacks: 4,
    weight: 60,
    requiresOwnedTags: ['fire'],
  },
  {
    id: 'up_wither_01',
    displayName: 'Deepening Rot',
    description: '+40% damage over time',
    tags: ['offence', 'curse'],
    modifiers: [{ target: 'dotDamage', op: 'increase', value: 0.4 }],
    maxStacks: 4,
    weight: 60,
    requiresOwnedTags: ['curse'],
  },
  {
    id: 'up_reach_01',
    displayName: "Miser's Instinct",
    description: '+45% pickup radius',
    tags: ['utility'],
    modifiers: [{ target: 'pickupRadius', op: 'increase', value: 0.45 }],
    maxStacks: 3,
    weight: 75,
  },
  {
    id: 'up_swift_01',
    displayName: 'Fleet Step',
    description: '+8% movement speed',
    tags: ['utility'],
    modifiers: [{ target: 'moveSpeed', op: 'increase', value: 0.08 }],
    maxStacks: 4,
    weight: 70,
  },
  {
    id: 'up_scholar_01',
    displayName: 'Keen Study',
    description: '+20% experience gained',
    tags: ['utility'],
    modifiers: [{ target: 'xpGain', op: 'increase', value: 0.2 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_greed_01',
    displayName: 'Gilded Touch',
    description: '+25% gold found',
    tags: ['utility'],
    modifiers: [{ target: 'goldGain', op: 'increase', value: 0.25 }],
    maxStacks: 3,
    weight: 55,
  },
]
