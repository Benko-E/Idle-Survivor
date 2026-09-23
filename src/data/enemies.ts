import type { EnemyDef } from './types'

export function findEnemyDef(id: string): EnemyDef | undefined {
  return ENEMY_DEFS.find((def) => def.id === id)
}

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
    // The id stays generic while the name follows the art. This is exactly
    // what spec 5.2 is for: recasting the commonest enemy from a slime to a
    // crab, for contrast reasons, cost one string.
    displayName: 'Scuttler',
    tags: ['melee', 'beast'],
    baseHp: 10,
    baseSpeed: 46,
    contactDamage: 6,
    xpValue: 2,
    radius: 11,
    dangerWeight: 1,
    spawnWeight: 100,
    unlockAtSeconds: 0,
    drops: [{ pickupId: 'pickup_gold_01', chance: 0.5 }],
    sprite: 'crab',
    colour: '#7a4a52',
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
    sprite: 'bat',
    colour: '#5f7a4a',
    flying: true,
  },
  {
    id: 'enemy_brute_01',
    displayName: 'Cave Spider',
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
    // pre-merged piles rather than a heap of loose coins.
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.06, tier: 2 },
      { pickupId: 'pickup_gold_01', chance: 0.35, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 1 },
    ],
    sprite: 'spider',
    colour: '#4f5f7a',
    // Twice the size it was drawn: the same spider, grown fat on wizards.
    scale: 2,
  },
  {
    id: 'enemy_swarm_01',
    displayName: 'Bee',
    tags: ['melee', 'beast', 'swarm'],
    // Each one is nothing; it's the eight of them that matter.
    baseHp: 3,
    baseSpeed: 62,
    contactDamage: 2,
    xpValue: 1,
    radius: 7,
    dangerWeight: 0.5,
    // Low, because one pick is a whole swarm.
    spawnWeight: 4,
    unlockAtSeconds: 45,
    groupSize: 8,
    groupSpread: 45,
    drops: [{ pickupId: 'pickup_gold_01', chance: 0.15 }],
    sprite: 'bee',
    colour: '#d8b040',
    flying: true,
  },
  {
    id: 'enemy_pack_01',
    displayName: 'Wolf',
    tags: ['melee', 'beast', 'fast'],
    baseHp: 16,
    // Quicker than a crab, but kept well under his pace even once the
    // difficulty curve speeds everything up: a pack that can match him
    // can't be escaped, and at 72 they did by minute ten.
    baseSpeed: 60,
    contactDamage: 5,
    xpValue: 4,
    radius: 12,
    dangerWeight: 1.4,
    spawnWeight: 6,
    unlockAtSeconds: 120,
    // A pack, all arriving from the same side at once.
    groupSize: 4,
    groupSpread: 60,
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.1, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 0.5 },
    ],
    sprite: 'wolf',
    colour: '#6a6f78',
  },
  {
    id: 'enemy_tank_01',
    displayName: 'Treant',
    tags: ['melee', 'heavy', 'plant'],
    // A walking wall: slow, enormous, and worth the effort.
    baseHp: 260,
    baseSpeed: 20,
    contactDamage: 24,
    xpValue: 40,
    radius: 24,
    dangerWeight: 3.5,
    spawnWeight: 3,
    unlockAtSeconds: 180,
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.3, tier: 2 },
      { pickupId: 'pickup_gold_01', chance: 1, tier: 1 },
    ],
    sprite: 'treant',
    colour: '#5a7a3a',
    scale: 1.9,
  },
  {
    id: 'enemy_gasshroom_01',
    displayName: 'Stinkcap',
    tags: ['plant', 'stationary'],
    baseHp: 18,
    baseSpeed: 0,
    contactDamage: 3,
    xpValue: 4,
    radius: 8,
    // Harmless where it stands. The danger is the gas it leaves, and the gas
    // puts itself on the danger map.
    dangerWeight: 0.2,
    spawnWeight: 5,
    unlockAtSeconds: 60,
    stationary: true,
    maxAlive: 12,
    onDeath: { hazard: { radius: 55, dps: 12, seconds: 5, colour: '#9ac43a' } },
    drops: [{ pickupId: 'pickup_gold_01', chance: 0.6 }],
    sprite: 'mushroom_purple',
    colour: '#8a5ab0',
    scale: 1.4,
  },
  {
    id: 'enemy_charger_01',
    displayName: 'Boar',
    tags: ['melee', 'beast', 'charger'],
    baseHp: 30,
    baseSpeed: 38,
    contactDamage: 8,
    xpValue: 6,
    radius: 11,
    dangerWeight: 1.5,
    spawnWeight: 6,
    unlockAtSeconds: 150,
    charge: { range: 230, windup: 0.8, speed: 250, distance: 300, impact: 16, recover: 0.7, cooldown: 3 },
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.1, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 0.55 },
    ],
    sprite: 'boar',
    colour: '#8a5a3a',
    scale: 1.2,
  },
  {
    id: 'enemy_broodshroom_01',
    displayName: 'Redcap',
    tags: ['plant', 'stationary'],
    baseHp: 30,
    baseSpeed: 0,
    contactDamage: 3,
    xpValue: 6,
    radius: 10,
    dangerWeight: 0.3,
    spawnWeight: 4,
    unlockAtSeconds: 200,
    stationary: true,
    maxAlive: 8,
    // Kill it and it bursts into sporelings that come for him.
    onDeath: { spawn: { enemyId: 'enemy_sporeling_01', count: 4, spread: 22 } },
    drops: [
      { pickupId: 'pickup_gold_01', chance: 0.2, tier: 1 },
      { pickupId: 'pickup_gold_01', chance: 0.6 },
    ],
    sprite: 'mushroom_red',
    colour: '#c03a3a',
    scale: 1.3,
  },
  {
    id: 'enemy_sporeling_01',
    displayName: 'Sporeling',
    tags: ['plant', 'exploder'],
    baseHp: 4,
    // Slower than him, so backing off and picking them off works; at 85 they
    // matched him by minute five and every Redcap cost him a quarter of his health.
    baseSpeed: 70,
    contactDamage: 0,
    xpValue: 1,
    radius: 6,
    dangerWeight: 1.6,
    // Never spawns by itself; only a Redcap's death makes these.
    spawnWeight: 0,
    unlockAtSeconds: 0,
    // Goes off on reaching him, and when killed. Shoot them early.
    // Seven each, because they come in fours and set each other off: a clump
    // arriving together is three or four blasts at once.
    fuse: { range: 2, seconds: 0, radius: 38, damage: 7 },
    onDeath: { explode: { radius: 38, damage: 7 } },
    drops: [],
    sprite: 'mushroom_red',
    colour: '#c03a3a',
    scale: 0.7,
  },
  {
    id: 'enemy_bomber_01',
    displayName: 'Fire Wisp',
    tags: ['elemental', 'fire', 'exploder'],
    baseHp: 10,
    baseSpeed: 66,
    contactDamage: 0,
    xpValue: 4,
    radius: 7,
    dangerWeight: 2,
    spawnWeight: 5,
    unlockAtSeconds: 270,
    flying: true,
    // Close in, it stops, lights up and swells; nearly a second later it goes
    // off. Time enough to walk clear, if he doesn't dawdle.
    fuse: { range: 45, seconds: 0.9, radius: 60, damage: 18 },
    drops: [{ pickupId: 'pickup_gold_01', chance: 0.5 }],
    sprite: 'wisp',
    colour: '#ff8a3a',
    scale: 1.2,
  },
]
