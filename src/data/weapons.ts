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
 * Every spell is one entry here, built from a handful of generic behaviours
 * (sim/behaviours.ts): projectile, nova, chain, curse, aura and zone. Meteor
 * and Thunderstorm are the same behaviour with different numbers; so are
 * Firebolt and Frostbolt. A new spell that reuses a behaviour is data alone.
 *
 * To take a spell out of the game, set `enabled: false` — it's never offered
 * and stops casting. Every number is live in the debug panel under "spells",
 * and "log changes" prints what you moved, ready to paste back here.
 *
 * Tags do two jobs: flavour, and letting upgrades select on them. A spell
 * tagged 'fire' gets Kindled Fury; one tagged 'dot' makes Deepening Rot
 * appear in the draft. Give a new spell the tags that describe it honestly
 * and the right upgrades follow with no other change.
 */
export const WEAPON_DEFS: WeaponDef[] = [
  // --- Bolts --------------------------------------------------------------------

  {
    id: 'spell_bolt_01',
    displayName: 'Firebolt',
    description: 'A fast bolt of fire at the nearest enemy',
    enabled: true,
    tier: 1,
    tags: ['spell', 'fire', 'projectile'],
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
    colour: '#ff8a3d',
  },
  {
    id: 'spell_frostbolt_01',
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
    colour: '#8fd8ff',
  },

  // --- Around him ---------------------------------------------------------------

  {
    id: 'spell_nova_01',
    displayName: 'Frost Nova',
    description: 'A burst of cold around him that damages and chills',
    // Shelved: no place in the fire/frost/lightning tiers yet. Kept for a
    // shadow or nature element, or for gear to grant.
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
    id: 'spell_aura_01',
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
    colour: '#ff6a2a',
  },
  {
    id: 'spell_curse_01',
    displayName: 'Curse of Withering',
    description: 'Afflicts everything nearby with slow, creeping decay',
    // Shelved: no place in the fire/frost/lightning tiers yet. Kept for a
    // shadow or nature element, or for gear to grant.
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

  // --- Jumping --------------------------------------------------------------------

  {
    id: 'spell_chain_01',
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
    colour: '#c9a6ff',
  },

  // --- On the ground, somewhere else ------------------------------------------------

  {
    id: 'spell_storm_01',
    displayName: 'Thunderstorm',
    description: 'Lightning strikes down on enemies around him',
    enabled: true,
    tier: 3,
    tags: ['spell', 'lightning', 'zone', 'area', 'strike'],
    behaviour: 'zone',
    targeting: 'random',
    // Trimmed in the balance pass: it took 43% of all damage in builds that
    // had it, against five other spells. 28% after.
    stats: {
      cooldown: 2.8,
      range: 420,
      // Strikes per cast, each on a different enemy.
      count: 3,
      area: 55,
      // A beat of warning on the ground before it lands.
      delay: 0.45,
      damage: 19,
      duration: 0,
    },
    colour: '#f4e76e',
  },
  {
    id: 'spell_meteor_01',
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
    colour: '#ff7b3d',
  },
  {
    id: 'spell_vortex_01',
    displayName: 'Vortex',
    description: 'Tears open a rift in the biggest crowd and drags enemies into it',
    // Shelved: no place in the fire/frost/lightning tiers yet. Kept for a
    // shadow or nature element, or for gear to grant.
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
    displayName: 'Entangling Roots',
    description: 'Roots burst from the ground under the biggest crowd, holding them still',
    // Shelved: no place in the fire/frost/lightning tiers yet. Kept for a
    // shadow or nature element, or for gear to grant.
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
