import type { WeaponDef } from './types'

/**
 * The spellbook. (spec 5.1)
 *
 * Laid out as a grid: three elements across, three tiers down. A run gets one
 * spell per tier — the first picked on the menu, the next two when their
 * tiers open — and picking one locks out the rest of that tier.
 *
 *              fire             frost          lightning
 *   tier 1     Firebolt         Frostbolt      Chain Lightning
 *   tier 2     Righteous Fire   Frozen Orb     Ball Lightning
 *   tier 3     Meteor           Blizzard       Thunderstorm
 *
 * The tiers differ in shape as well as power. Tier 1 aims at single enemies.
 * Tier 2 covers the ground around him: an aura, a line, an orbit. Tier 3 is
 * placed on the map, on the crowd: one heavy impact, a lasting field, a storm.
 *
 * Every spell is built from a handful of generic behaviours
 * (sim/behaviours.ts): projectile, chain, aura, orbit, zone, plus nova and
 * curse for the shelved ones. Meteor, Blizzard and Thunderstorm are all
 * 'zone' with different numbers. A new spell that reuses a behaviour is data.
 *
 * To take a spell out of the game, set `enabled: false`. Every number is live
 * in the debug panel under "spells", and "log changes" prints what you moved.
 *
 * Tags do two jobs: flavour, and letting upgrades select on them. A spell
 * tagged 'fire' gets Kindled Fury; one tagged 'dot' makes Deepening Rot
 * appear in the draft. Tag honestly and the right upgrades follow.
 *
 * Numbers are first guesses since the move to tiers. The balance pass that
 * tuned the old roster assumed four to six spells a run; with three, it
 * needs doing again.
 */
export const WEAPON_DEFS: WeaponDef[] = [
  // --- Tier 1: the starting pick ---------------------------------------------------

  {
    id: 'spell_bolt_01',
    classId: 'class_wizard',
    displayName: 'Firebolt',
    description: 'A fast bolt of fire at the nearest enemy',
    enabled: true,
    tier: 1,
    tags: ['spell', 'fire', 'projectile', 'bolt'],
    behaviour: 'projectile',
    stats: {
      cooldown: 0.95,
      damage: 9,
      count: 1,
      speed: 360,
      pierce: 0,
      range: 520,
      spread: 0.14,
    },
    // The scorch is Phoenix Bolt's trail.
    fx: { hit: 'hit_fire', ground: 'scorch' },
    colour: '#ff8a3d',
  },
  {
    id: 'spell_frostbolt_01',
    classId: 'class_wizard',
    displayName: 'Frostbolt',
    description: 'A slower bolt of ice that chills whatever it hits',
    enabled: true,
    tier: 1,
    tags: ['spell', 'frost', 'projectile'],
    behaviour: 'projectile',
    stats: {
      cooldown: 1.1,
      damage: 8,
      count: 1,
      speed: 300,
      // Passes through one, so the chill spreads a little down a line.
      pierce: 1,
      range: 480,
      spread: 0.14,
      slow: 0.35,
      duration: 1.6,
    },
    fx: { hit: 'hit_frost' },
    colour: '#8fd8ff',
  },
  {
    id: 'spell_chain_01',
    classId: 'class_wizard',
    displayName: 'Chain Lightning',
    description: 'Lightning that leaps from enemy to enemy',
    enabled: true,
    tier: 1,
    tags: ['spell', 'lightning', 'chain'],
    behaviour: 'chain',
    // Buffed in the balance pass: the weakest spell alone, and as a starter
    // it died first. Its short range left it idle more than anything else.
    stats: {
      cooldown: 2.2,
      damage: 17,
      // The first target plus three jumps.
      count: 4,
      range: 420,
      // How far it will reach for the next link.
      jumpRange: 165,
      falloff: 0.78,
    },
    fx: { hit: 'hit_lightning', arc: 'arc' },
    colour: '#c9a6ff',
  },

  // --- Tier 2: the ground around him, from level 6 -----------------------------------

  {
    id: 'spell_aura_01',
    classId: 'class_wizard',
    displayName: 'Righteous Fire',
    description: 'A ring of holy fire around him, burning everything close',
    enabled: true,
    tier: 2,
    tags: ['spell', 'fire', 'aura', 'area', 'dot'],
    behaviour: 'aura',
    stats: {
      // How often the burn is refreshed on everything inside — not a delay
      // the player feels. Duration outlasts it, so the burn is continuous
      // while they stay close and fades a moment after they leave.
      cooldown: 0.4,
      // Wider and hotter after the balance pass. He keeps his distance from
      // enemies — that's the movement AI doing its job — so a small aura
      // rarely touched anything: 12% of damage when owned, 20% after.
      area: 130,
      dotDamage: 10,
      duration: 1,
    },
    fx: { flames: 'holy_flames' },
    colour: '#ff6a2a',
  },
  {
    id: 'spell_orb_01',
    classId: 'class_wizard',
    displayName: 'Frozen Orb',
    description: 'A slow ball of ice that ploughs through everything in its path, chilling as it goes',
    enabled: true,
    tier: 2,
    tags: ['spell', 'frost', 'projectile', 'area'],
    behaviour: 'projectile',
    stats: {
      cooldown: 2.6,
      damage: 16,
      count: 1,
      // Slow on purpose: it's the time spent crossing the crowd that makes
      // it hit so much of it.
      speed: 140,
      // Effectively endless. Lancing Bolt still adds to it, harmlessly.
      pierce: 999,
      range: 620,
      spread: 0.3,
      size: 16,
      slow: 0.3,
      duration: 1.4,
    },
    fx: { hit: 'hit_frost' },
    colour: '#bfeaff',
  },
  {
    id: 'spell_ball_01',
    classId: 'class_wizard',
    displayName: 'Ball Lightning',
    description: 'Orbs of lightning circle him, striking anything they touch',
    enabled: true,
    tier: 2,
    tags: ['spell', 'lightning', 'orbit', 'area'],
    behaviour: 'orbit',
    stats: {
      // How often the orbs check what they're touching, not a felt delay.
      cooldown: 0.1,
      damage: 14,
      // Orbs circling at once.
      count: 2,
      // Orbit radius. Widened Sigils pushes them further out.
      area: 90,
      // Radians per second: about one lap every two seconds.
      speed: 3.2,
      // Each orb's own radius.
      size: 13,
      // Seconds before one enemy can be hit by the same spell again.
      rehit: 0.5,
    },
    fx: { hit: 'hit_lightning', orb: 'ball_lightning' },
    colour: '#f1e05a',
  },

  // --- Tier 3: on the crowd, from level 15 --------------------------------------------

  {
    id: 'spell_meteor_01',
    classId: 'class_wizard',
    displayName: 'Meteor',
    description: 'Calls a meteor down on the biggest crowd. Slow, but it hits hard',
    enabled: true,
    tier: 3,
    tags: ['spell', 'fire', 'zone', 'area'],
    behaviour: 'zone',
    targeting: 'densest',
    stats: {
      cooldown: 4,
      range: 460,
      count: 1,
      area: 95,
      delay: 1.1,
      // 55 at first, then 45 — still the heaviest share when owned (42%), so
      // down again. The balance pass section of the README has the numbers.
      damage: 40,
      duration: 0,
    },
    fx: { fall: 'meteor', impact: 'explosion' },
    colour: '#ff7b3d',
  },
  {
    id: 'spell_blizzard_01',
    classId: 'class_wizard',
    displayName: 'Blizzard',
    description: 'A howling storm of ice over the biggest crowd, chilling and grinding down all inside',
    enabled: true,
    tier: 3,
    tags: ['spell', 'frost', 'zone', 'area', 'dot'],
    behaviour: 'zone',
    targeting: 'densest',
    stats: {
      cooldown: 6,
      range: 440,
      count: 1,
      area: 125,
      delay: 0.3,
      duration: 4.5,
      dotDamage: 10,
      slow: 0.45,
    },
    fx: { ground: 'frost_ground', particle: 'ice_shard' },
    colour: '#d6f3ff',
  },
  {
    id: 'spell_storm_01',
    classId: 'class_wizard',
    displayName: 'Thunderstorm',
    description: 'A storm settles over the biggest crowd, lightning striking at random beneath it',
    enabled: true,
    tier: 3,
    tags: ['spell', 'lightning', 'zone', 'area', 'strike'],
    behaviour: 'zone',
    targeting: 'densest',
    // Reworked for tier 3: a storm that sits over a crowd for a while, rather
    // than a quick volley of three separate strikes.
    stats: {
      cooldown: 5.5,
      range: 420,
      count: 1,
      area: 150,
      delay: 0.4,
      duration: 4,
      // Strikes per second while it's overhead, each on a random enemy under it.
      strikeRate: 3,
      // Per strike, to everything within strikeRadius of it.
      damage: 18,
      strikeRadius: 45,
    },
    fx: { cloud: 'storm_cloud', strike: 'strike', hit: 'hit_lightning' },
    colour: '#f4e76e',
  },

  // --- Shelved ------------------------------------------------------------------------
  //
  // No place in the fire/frost/lightning grid yet. Kept, switched off and
  // without a tier, for a shadow or nature element, or for gear to grant.

  {
    id: 'spell_nova_01',
    classId: 'class_wizard',
    displayName: 'Frost Nova',
    description: 'A burst of cold around him that damages and chills',
    enabled: false,
    tags: ['spell', 'frost', 'area'],
    behaviour: 'nova',
    stats: {
      cooldown: 3.6,
      damage: 11,
      area: 155,
      slow: 0.45,
      duration: 2.4,
    },
    colour: '#7fd8ff',
  },
  {
    id: 'spell_curse_01',
    classId: 'class_wizard',
    displayName: 'Curse of Withering',
    description: 'Afflicts everything nearby with slow, creeping decay',
    dotCondition: 'withering',
    enabled: false,
    tags: ['spell', 'shadow', 'curse', 'area', 'dot'],
    behaviour: 'curse',
    stats: {
      cooldown: 2.2,
      area: 210,
      dotDamage: 7,
      duration: 3.5,
    },
    colour: '#9d7bd8',
  },
  {
    id: 'spell_vortex_01',
    classId: 'class_wizard',
    displayName: 'Vortex',
    description: 'Tears open a rift in the biggest crowd and drags enemies into it',
    enabled: false,
    tags: ['spell', 'shadow', 'zone', 'area', 'dot'],
    behaviour: 'zone',
    targeting: 'densest',
    stats: {
      cooldown: 5.5,
      range: 380,
      count: 1,
      area: 140,
      delay: 0.1,
      duration: 2.8,
      pull: 85,
      dotDamage: 6,
    },
    colour: '#7b5cff',
  },
  {
    id: 'spell_roots_01',
    classId: 'class_wizard',
    displayName: 'Entangling Roots',
    description: 'Roots burst from the ground under the biggest crowd, holding them still',
    enabled: false,
    tags: ['spell', 'nature', 'zone', 'area', 'root'],
    behaviour: 'zone',
    targeting: 'densest',
    stats: {
      cooldown: 4.5,
      range: 360,
      count: 1,
      area: 115,
      delay: 0.25,
      damage: 6,
      duration: 0,
      root: 1.8,
    },
    colour: '#6fcf5a',
  },
]

export function findWeaponDef(id: string): WeaponDef {
  const def = WEAPON_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No weapon definition with id "${id}"`)
  return def
}
