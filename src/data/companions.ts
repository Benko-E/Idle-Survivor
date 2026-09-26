import type { CompanionDef } from './types'

/**
 * Companions: whatever fights at his side. Nothing grants one in normal play
 * yet — which spell, upgrade or class does is for the spellbook to decide —
 * so the only way to see one is the debug panel's `debug.testCompanion`.
 *
 * A companion is its numbers and its spells. Its spells are ordinary spell
 * entries in data/weapons.ts with no tier, so they're never offered as his
 * own; the companion casts them from where it stands.
 */
export const COMPANION_DEFS: CompanionDef[] = [
  {
    id: 'companion_fire_elemental_01',
    displayName: 'Fire Elemental',
    classId: 'class_wizard',
    speed: 130,
    radius: 8,
    leash: 170,
    reach: 330,
    engageDistance: 130,
    spells: ['spell_elemental_bolt_01'],
    colour: '#ff9a3d',
  },
]

export function findCompanion(id: string): CompanionDef | undefined {
  return COMPANION_DEFS.find((def) => def.id === id)
}
