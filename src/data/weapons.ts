import type { WeaponDef } from './types'

/**
 * The spellbook. (spec 5.1)
 *
 * Four entries covering four different behaviours, which is the point of the
 * set rather than any attempt at a real roster — the spec says the actual
 * spell list gets decided later (spec 7). What matters is that a fifth entry
 * reusing 'projectile' is data alone, and the ids are generic enough that
 * renaming Firebolt to Magic Missile is a one-word change.
 */
export const WEAPON_DEFS: WeaponDef[] = [
  {
    id: 'spell_bolt_01',
    displayName: 'Firebolt',
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
    id: 'spell_nova_01',
    displayName: 'Frost Nova',
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
    id: 'spell_chain_01',
    displayName: 'Chain Lightning',
    tags: ['spell', 'lightning', 'chain'],
    behaviour: 'chain',
    stats: {
      cooldown: 2.7,
      damage: 15,
      // The first target plus three jumps.
      count: 4,
      range: 320,
      // How far it will reach for the next link.
      jumpRange: 165,
      falloff: 0.78,
    },
    colour: '#c9a6ff',
  },
  {
    id: 'spell_curse_01',
    displayName: 'Curse of Withering',
    tags: ['spell', 'shadow', 'curse', 'area'],
    behaviour: 'curse',
    stats: {
      cooldown: 2.2,
      area: 210,
      dotDamage: 7,
      duration: 3.5,
    },
    colour: '#9d7bd8',
  },
]

export function findWeaponDef(id: string): WeaponDef {
  const def = WEAPON_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No weapon definition with id "${id}"`)
  return def
}
