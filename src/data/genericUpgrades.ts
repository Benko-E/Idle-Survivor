import type { UpgradeDef } from './types'

/**
 * Upgrade lists shared by every spell of one shape — bolts now, beams and
 * chains later — from the spellbook's "Generic upgrade ideas".
 *
 * Each spell gets its own copies, with its own spellId and ids, so a pick for
 * one spell never reaches another: two bolt spells each have their own
 * Pierce. `prefix` makes the ids: boltUpgrades('spell_firebolt_01',
 * 'up_firebolt') gives up_firebolt_pierce, up_firebolt_fork, and so on.
 */
export function boltUpgrades(spellId: string, prefix: string): UpgradeDef[] {
  return [
    {
      id: `${prefix}_pierce`,
      spellId,
      displayName: 'Pierce',
      description: 'Passes through 1 more enemy',
      details: 'The bolt passes through an enemy instead of stopping, and can hit another one behind it.',
      tags: ['offence'],
      modifiers: [{ target: 'pierce', op: 'add', value: 1 }],
      grantsTags: ['piercing'],
      maxStacks: 3,
      weight: 55,
    },
    {
      id: `${prefix}_fork`,
      spellId,
      displayName: 'Fork',
      description: 'Hits throw a small bolt at another enemy',
      details: 'After its first hit, the bolt throws a smaller bolt at another enemy nearby.',
      tags: ['offence'],
      // Forks are plain bolts at half the hit's damage (combat.forkDamage).
      modifiers: [{ target: 'fork', op: 'add', value: 1 }],
      maxStacks: 3,
      weight: 55,
    },
    {
      id: `${prefix}_return`,
      spellId,
      displayName: 'Return',
      description: 'The bolt comes back to him',
      details: 'At the end of its flight, or when an enemy stops it, the bolt turns around and flies back to him, through everything on the way.',
      tags: ['offence'],
      modifiers: [{ target: 'returns', op: 'add', value: 1 }],
      maxStacks: 1,
      weight: 45,
    },
    {
      id: `${prefix}_heavy`,
      spellId,
      displayName: 'Heavy Bolt',
      description: 'Bigger and slower, hits harder',
      details: 'The bolt is bigger and slower, and hits harder.',
      tags: ['offence'],
      modifiers: [
        { target: 'boltSpeed', op: 'multiply', value: 0.6 },
        { target: 'boltSize', op: 'multiply', value: 1.5 },
        { target: 'boltDamage', op: 'multiply', value: 1.6 },
      ],
      pairedWith: `${prefix}_accelerating`,
      maxStacks: 1,
      weight: 45,
    },
    {
      id: `${prefix}_accelerating`,
      spellId,
      displayName: 'Accelerating Bolt',
      description: 'Speeds up, and hits harder as it does',
      details: 'The bolt starts slow and speeds up as it flies. The faster it goes, the harder it hits.',
      tags: ['offence'],
      // Half speed to twice by the end of its flight; damage follows (combat.accelerate*).
      modifiers: [{ target: 'accelerate', op: 'add', value: 1 }],
      maxStacks: 1,
      weight: 45,
    },
    {
      id: `${prefix}_split`,
      spellId,
      displayName: 'Split Shot',
      description: 'More bolts, sharing the damage',
      details: 'Fires more bolts at once, fanned out, sharing the damage between them. Only the main bolt returns and forks.',
      tags: ['offence'],
      // +1 bolt a pick, up to 3 bolts: each hits for a third.
      modifiers: [{ target: 'split', op: 'add', value: 1 }],
      maxStacks: 2,
      weight: 50,
    },
  ]
}

/**
 * The generic beam list (spellbook): for any spell that channels a beam — Ray
 * of Frost now, a warlock's Drain Life or a fire Scorching Ray one day. A
 * fork off a beam is a spawn, so it's plain: a share of the damage, and none
 * of the spell's upgrades.
 */
export function beamUpgrades(spellId: string, prefix: string): UpgradeDef[] {
  return [
    {
      id: `${prefix}_pierce`,
      spellId,
      displayName: 'Beam Pierce',
      description: 'The beam passes through 1 more enemy',
      details: 'The beam carries on through its target and touches the enemy behind it too.',
      tags: ['offence'],
      modifiers: [{ target: 'pierce', op: 'add', value: 1 }],
      grantsTags: ['piercing'],
      maxStacks: 3,
      weight: 55,
    },
    {
      id: `${prefix}_fork`,
      spellId,
      displayName: 'Beam Fork',
      description: 'A second beam splits off to another enemy',
      details: 'A smaller beam splits off its target to another enemy nearby, at half the damage and none of its other effects.',
      tags: ['offence'],
      // A plain beam at beam.forkShare of the damage; each pick another one.
      modifiers: [{ target: 'fork', op: 'add', value: 1 }],
      maxStacks: 2,
      weight: 50,
    },
  ]
}
