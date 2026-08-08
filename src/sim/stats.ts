import { resolveStat } from '../core/modifiers'
import type { World, WeaponInstance } from './world'

/**
 * Every stat read in the game goes through one of these two functions.
 *
 * The difference is only what the modifier's tag selector is matched against:
 * a spell's own tags, or nothing at all for stats that belong to the character
 * rather than to any one spell.
 *
 * The modifier list is still empty until the draft exists, so today both of
 * these are expensive ways to return a base value. That's the intended state —
 * the machinery has to be in the path *before* there's anything in it, or
 * putting it there later means touching every call site in the game.
 */

/** Scoped by the spell's tags, so "+15% to fire spells" can select on them. */
export function weaponStat(world: World, weapon: WeaponInstance, key: string): number {
  const base = weapon.def.stats[key] ?? 0
  return resolveStat(base, key, world.modifiers, weapon.def.tags)
}

/**
 * Character-wide stats: pickup radius, XP gain, move speed. These belong to
 * him rather than to a spell, so only untagged modifiers apply — unless the
 * caller passes tags describing what's being acted *on*, which is how
 * "+50% XP from rare globes" works.
 */
export function characterStat(world: World, key: string, base: number, subjectTags: readonly string[] = []): number {
  return resolveStat(base, key, world.modifiers, subjectTags)
}
