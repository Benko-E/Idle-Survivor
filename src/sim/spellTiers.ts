import { config } from '../config'
import type { ClassDef, WeaponDef } from '../data/types'
import { settleBuildBonus } from './buildBonus'
import { WEAPON_DEFS } from '../data/weapons'
import type { World } from './world'

/**
 * How spells are gained: one per tier, chosen from that tier's options, and
 * the choice is final.
 *
 * Tier 1 is picked on the menu before the run. Each later tier opens at a
 * level (`spells.tierLevels`) and offers every enabled spell of that tier —
 * one per element. Taking one closes the tier, which is the whole of the
 * lock-out: nothing needs remembering beyond which spells he owns, because
 * owning a tier's spell *is* having made that tier's choice.
 *
 * Spells never appear in the ordinary level-up draft. That's upgrades only.
 * And a class only ever sees its own: each spell names the class it belongs to.
 */

/** Every enabled spell of a tier for a class, in data order. */
export function spellsOfTier(classDef: ClassDef, tier: number): WeaponDef[] {
  return WEAPON_DEFS.filter((def) => def.enabled && def.tier === tier && def.classId === classDef.id)
}

/** The level a tier opens at. Tier 1 is always open — it's the starting pick. */
export function tierUnlockLevel(tier: number): number {
  if (tier <= 1) return 1
  return config.spells.tierLevels[tier - 2] ?? Infinity
}

/** How many tiers exist: the starting one plus each unlock level. */
export function tierCount(): number {
  return 1 + config.spells.tierLevels.length
}

function ownsTier(world: World, tier: number): boolean {
  return world.weapons.some((weapon) => weapon.def.tier === tier)
}

/**
 * The tier waiting to be chosen, or null. The lowest open one first, so a
 * player who ignored tier 2 until level 15 is asked about 2 before 3.
 * Tiers with nothing enabled in them are skipped rather than blocking.
 */
export function pendingSpellTier(world: World): number | null {
  if (world.state !== 'running') return null
  for (let tier = 2; tier <= tierCount(); tier++) {
    if (world.level < tierUnlockLevel(tier)) return null
    if (ownsTier(world, tier)) continue
    if (spellsOfTier(world.classDef, tier).length === 0) continue
    return tier
  }
  return null
}

/**
 * Take a tier's spell. Ignored unless that tier is the one waiting and the
 * spell belongs to it — so a stale card from a previous run, or a double
 * click, can't hand out a second spell from the same tier.
 */
export function takeSpell(world: World, def: WeaponDef): void {
  const tier = pendingSpellTier(world)
  if (tier === null || def.tier !== tier || !def.enabled || def.classId !== world.classDef.id) return
  world.weapons.push({ def, cooldownRemaining: 0.1, timesCast: 0, idleSeconds: 0, damageDealt: 0 })
  settleBuildBonus(world, tierCount())
}
