import type { EnemyDef } from './types'

/**
 * The entire enemy roster. (spec 5.1)
 *
 * Adding an enemy means adding an entry here and nothing else — no new class,
 * no branch anywhere in the simulation. Three entries exist only to prove that
 * claim and to give the spawn weighting something to choose between; the spec
 * says the real roster and difficulty ramp get iterated on heavily later
 * (spec 7), so treat every number below as a placeholder.
 */
export const ENEMY_DEFS: EnemyDef[] = [
  {
    id: 'enemy_basic_01',
    displayName: 'Shambler',
    tags: ['melee', 'undead'],
    baseHp: 10,
    baseSpeed: 46,
    contactDamage: 6,
    xpValue: 2,
    radius: 11,
    dangerWeight: 1,
    spawnWeight: 100,
    unlockAtSeconds: 0,
    drops: [{ pickupId: 'pickup_gold_01', chance: 0.5 }],
    colour: '#7a4a52',
    drawHeight: 30,
  },
  {
    id: 'enemy_fast_01',
    displayName: 'Stalker',
    tags: ['melee', 'fast'],
    baseHp: 6,
    baseSpeed: 78,
    contactDamage: 4,
    xpValue: 3,
    radius: 9,
    // Rated above its damage: it closes fast, so the room it takes away is
    // worth more than the hit it lands.
    dangerWeight: 1.3,
    spawnWeight: 45,
    unlockAtSeconds: 30,
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.08, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 0.55 },
    ],
    // Deliberately not gold — the character is yellow, and a mass of Stalkers
    // was reading as "where did he go?" at a glance.
    colour: '#5f7a4a',
    drawHeight: 24,
  },
  {
    id: 'enemy_brute_01',
    displayName: 'Hulk',
    tags: ['melee', 'heavy'],
    baseHp: 46,
    baseSpeed: 30,
    contactDamage: 16,
    // Worth roughly five Shamblers, so clearing one is real progress.
    xpValue: 11,
    radius: 18,
    dangerWeight: 2.4,
    spawnWeight: 18,
    unlockAtSeconds: 75,
    // Rare, slow and tanky, so it's worth going out of your way for. Drops
    // pre-merged globes rather than a bigger pile of small ones.
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.06, tier: 2 },
      { pickupId: 'pickup_gold_01', chance: 0.35, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 1 },
    ],
    colour: '#4f5f7a',
    drawHeight: 46,
  },
]
