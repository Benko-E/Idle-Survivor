import { WIZARD_THOUGHTS } from './thoughts'
import type { ClassDef } from './types'

/**
 * The character classes. (spec 5.1: content is data)
 *
 * One so far. A class brings its own abilities — every entry in
 * data/weapons.ts names the class it belongs to, and no other class is ever
 * offered it — its own base numbers, look and thoughts. Upgrades can be
 * limited to classes too (UpgradeDef.classIds); left open, every class gets
 * them.
 *
 * Shared by every class, and deliberately not here: the conditions (burning
 * is burning whoever lit it), the enemies, the world, and the banked gold,
 * which is one pot for the whole save.
 */
export const CLASS_DEFS: ClassDef[] = [
  {
    id: 'class_wizard',
    displayName: 'Wizard',
    description: 'Fire, frost and lightning, from a safe distance',
    abilityNoun: 'spell',
    elements: ['fire', 'frost', 'lightning'],
    stats: {
      // Should stay comfortably above enemy speeds — if he can't outpace the
      // swarm, no amount of clever positioning helps.
      moveSpeed: 110,
      radius: 15,
      maxHp: 100,
      // There's no other healing, so at 0 every scratch in the first minutes
      // was permanent: runs that took an early bad patch spent the rest of the
      // run on a sliver of health and died to the next thing that touched
      // them. Half a point a second — 30 a minute — lets early chip damage
      // recover without making a real mauling survivable. Second Wind adds to it.
      hpRegen: 0.5,
    },
    sprite: 'hero',
    castSprite: 'hero_cast',
    // His 36-pixel frame, at render.pixelScale.
    drawHeight: 46,
    thoughts: WIZARD_THOUGHTS,
  },
]

/** The class a run gets when none is chosen — the only one, for now. */
export const DEFAULT_CLASS = CLASS_DEFS[0]

export function findClass(id: string | undefined): ClassDef {
  return CLASS_DEFS.find((def) => def.id === id) ?? DEFAULT_CLASS
}
