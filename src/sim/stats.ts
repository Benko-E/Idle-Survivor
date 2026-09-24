import { resolveStat } from '../core/modifiers'
import type { World, WeaponInstance } from './world'

/**
 * Every stat read in the game goes through one of these two functions.
 *
 * The difference is only what the modifier's tag selector is matched against:
 * a spell's own tags, or nothing at all for stats that belong to the character
 * rather than to any one spell.
 *
 * Nothing reads a stat any other way. That's what lets every upgrade the
 * draft hands out apply everywhere at once, with no code per upgrade.
 */

/**
 * Scoped by the spell's tags, so "+15% to fire spells" can select on them.
 *
 * `fallback` is the base for a stat the spell's data entry doesn't list. Zero
 * suits most stats, but a rate like `cooldownRecovery` has to start at 1 or
 * every spell would recharge at zero speed.
 */
export function weaponStat(world: World, weapon: WeaponInstance, key: string, fallback = 0): number {
  const base = weapon.def.stats[key] ?? fallback
  return resolveStat(base, key, world.modifiers, spellTags(world, weapon))
}

const tagCache = new WeakMap<WeaponInstance, { granted: string[] | undefined; count: number; tags: string[] }>()

/**
 * Everything a spell counts as: its own tags, its id — which is how an
 * upgrade made for one spell selects only that spell — and any keywords
 * upgrades have given it. Cached, since every stat read asks.
 */
export function spellTags(world: World, weapon: WeaponInstance): readonly string[] {
  const granted = world.grantedTags[weapon.def.id]
  const cached = tagCache.get(weapon)
  if (cached && cached.granted === granted && cached.count === (granted?.length ?? 0)) return cached.tags
  const tags = [...weapon.def.tags, weapon.def.id, ...(granted ?? [])]
  tagCache.set(weapon, { granted, count: granted?.length ?? 0, tags })
  return tags
}

/**
 * Character-wide stats. These belong to him rather than to a spell, so only
 * untagged modifiers apply — unless the caller passes tags describing what's
 * being acted *on*, which is how "+50% XP from undead" works.
 *
 * The keys in use, and what the base passed in is:
 *
 *   moveSpeed     world units per second        his class's stats.moveSpeed
 *   maxHp         health ceiling                his class's stats.maxHp
 *   hpRegen       health restored per second    his class's stats.hpRegen
 *   damageTaken   multiplier on damage taken    1
 *   pickupRadius  how close gold must be        config.pickups.collectRadius
 *   xpGain        XP per kill                   the enemy's xpValue
 *   goldGain      gold per pickup               the pile's gold
 *
 * Gear and character stats will be more modifiers into the same list, so a
 * new source of "+20 max health" needs no code at all.
 */
export function characterStat(world: World, key: string, base: number, subjectTags: readonly string[] = []): number {
  return resolveStat(base, key, world.modifiers, subjectTags)
}
