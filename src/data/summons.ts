import type { SummonDef } from './types'

/**
 * Summons: anything conjured into the world that casts spells of its own. A
 * companion at his side is one kind; so is a Righteous Fire left on the
 * grass, or a lightning serpent. What each does is its movement, its
 * lifetime, its body and its spells — sim/summons.ts has the rest.
 *
 * Nothing grants one in normal play yet: which spell, upgrade or class does
 * is for the spellbook to decide. The debug panel's `debug.test…` switches
 * summon the ones below to try them.
 *
 * A summon's spells are ordinary spell entries. Its own ones (no tier, never
 * offered to him) get only his upgrades that go by tag. One of *his* spells
 * shares everything he's picked for it: a Righteous Fire on the grass burns
 * with his Crown of Flames, his Beacon, his Clinging Flames.
 */
export const SUMMON_DEFS: SummonDef[] = [
  {
    id: 'summon_fire_elemental_01',
    displayName: 'Fire Elemental',
    classId: 'class_wizard',
    movement: 'leash',
    speed: 130,
    radius: 8,
    duration: 0,
    leash: 170,
    reach: 330,
    engageDistance: 130,
    spells: ['spell_elemental_bolt_01'],
    look: 'orb',
    colour: '#ff9a3d',
  },
  {
    id: 'summon_ground_fire_01',
    displayName: 'Ground Fire',
    classId: 'class_wizard',
    movement: 'still',
    speed: 0,
    radius: 6,
    duration: 8,
    leash: 0,
    reach: 0,
    spells: ['spell_aura_01'],
    look: 'none',
    colour: '#ff6a2a',
  },
  {
    id: 'summon_wandering_fire_01',
    displayName: 'Wandering Fire',
    classId: 'class_wizard',
    movement: 'drift',
    speed: 55,
    radius: 6,
    duration: 0,
    leash: 260,
    reach: 300,
    turnRate: 1.5,
    spells: ['spell_aura_01'],
    look: 'orb',
    colour: '#ff6a2a',
  },
  {
    id: 'summon_lightning_serpent_01',
    displayName: 'Lightning Serpent',
    classId: 'class_wizard',
    movement: 'slither',
    speed: 150,
    radius: 6,
    duration: 0,
    leash: 280,
    reach: 320,
    turnRate: 3.2,
    weave: 0.7,
    weaveRate: 5,
    body: { segments: 14, spacing: 12 },
    spells: ['spell_serpent_coil_01'],
    look: 'orb',
    bodyArt: 'arc',
    colour: '#c9a6ff',
  },
]

export function findSummon(id: string): SummonDef | undefined {
  return SUMMON_DEFS.find((def) => def.id === id)
}
