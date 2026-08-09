import { config } from '../config'
import type { UpgradeDef, WeaponDef } from '../data/types'
import { UPGRADE_DEFS } from '../data/upgrades'
import { WEAPON_DEFS } from '../data/weapons'
import type { World } from './world'

/**
 * What the level-up draft offers, and what taking it does. (spec 4)
 *
 * All the selection logic lives here — eligibility, weighting, exclusions —
 * because the spec is explicit that it will get more complicated and should
 * only ever need changing in one place.
 *
 * Offers are built when the panel opens rather than when the level is earned.
 * The game doesn't pause, so the world has moved on since he levelled, and an
 * offer list assembled thirty seconds ago could suggest a fire upgrade for a
 * spell he no longer... well, not yet — but it will matter the moment
 * anything can be lost or replaced.
 */

export type Offer =
  | { kind: 'weapon'; id: string; displayName: string; description: string; def: WeaponDef }
  | { kind: 'upgrade'; id: string; displayName: string; description: string; def: UpgradeDef }

function ownsTag(world: World, tag: string): boolean {
  return world.weapons.some((weapon) => weapon.def.tags.includes(tag))
}

function upgradeIsEligible(world: World, def: UpgradeDef): boolean {
  if ((world.upgradesTaken[def.id] ?? 0) >= def.maxStacks) return false
  if (!def.requiresOwnedTags) return true
  return def.requiresOwnedTags.every((tag) => ownsTag(world, tag))
}

function candidates(world: World): { offer: Offer; weight: number }[] {
  const pool: { offer: Offer; weight: number }[] = []

  for (const def of WEAPON_DEFS) {
    if (world.weapons.some((weapon) => weapon.def.id === def.id)) continue
    if (world.weapons.length >= config.draft.maxWeapons) continue
    pool.push({
      offer: { kind: 'weapon', id: def.id, displayName: def.displayName, description: 'New spell', def },
      // New spells are worth more than an increment, so they're weighted up.
      weight: config.draft.newWeaponWeight,
    })
  }

  for (const def of UPGRADE_DEFS) {
    if (!upgradeIsEligible(world, def)) continue
    pool.push({
      offer: { kind: 'upgrade', id: def.id, displayName: def.displayName, description: def.description, def },
      weight: def.weight,
    })
  }

  return pool
}

/** Weighted pick without replacement, so one draft never repeats an option. */
export function buildOffers(world: World): Offer[] {
  const pool = candidates(world)
  const chosen: Offer[] = []
  const wanted = Math.min(config.draft.choices, pool.length)

  while (chosen.length < wanted) {
    let total = 0
    for (const entry of pool) total += entry.weight

    let cursor = world.rng() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      cursor -= pool[i].weight
      if (cursor <= 0) {
        index = i
        break
      }
    }

    chosen.push(pool[index].offer)
    pool.splice(index, 1)
  }

  return chosen
}

/**
 * Taking an offer. Two lines of actual work, which is the whole point of
 * having built the modifier system three steps early.
 */
export function takeOffer(world: World, offer: Offer): void {
  if (offer.kind === 'weapon') {
    world.weapons.push({ def: offer.def, cooldownRemaining: 0.1, timesCast: 0 })
  } else {
    world.modifiers.push(...offer.def.modifiers)
    world.upgradesTaken[offer.id] = (world.upgradesTaken[offer.id] ?? 0) + 1
  }

  world.pendingLevelUps = Math.max(0, world.pendingLevelUps - 1)
}
