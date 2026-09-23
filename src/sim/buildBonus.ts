import { config } from '../config'
import type { WeaponDef } from '../data/types'
import type { Modifier } from '../core/modifiers'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * Rewards for how a run's spells fit together, decided when the last tier is
 * chosen and kept for the rest of the run.
 *
 *   pure        all one element: that element hits harder. Commitment pays.
 *   prismatic   one of each: Elemental Equilibrium. An enemy hit by one
 *               element takes more from the others for a few seconds, so
 *               the reward is for mixing elements *on the same enemy*.
 *
 * Anything in between — two of one and one other — gets nothing. That's the
 * point: it makes committing, or daring, a real decision.
 */

export const ELEMENTS = ['fire', 'frost', 'lightning'] as const

export function elementOf(def: WeaponDef): string | undefined {
  return ELEMENTS.find((element) => def.tags.includes(element))
}

export type BuildBonus = { kind: 'pure'; element: string } | { kind: 'prismatic' } | null

/** What a full set of spells earns. Needs one spell per element slot. */
export function bonusFor(elements: (string | undefined)[], slots: number): BuildBonus {
  if (elements.length < slots || elements.some((element) => element === undefined)) return null
  const distinct = new Set(elements)
  if (distinct.size === 1) return { kind: 'pure', element: elements[0]! }
  if (distinct.size === elements.length) return { kind: 'prismatic' }
  return null
}

/** The modifiers a pure build adds: more damage, and more burn, for its element. */
function pureModifiers(element: string): Modifier[] {
  const value = config.buildBonus.pureDamage
  return [
    { target: 'damage', op: 'increase', value, tags: [element] },
    { target: 'dotDamage', op: 'increase', value, tags: [element] },
  ]
}

/**
 * Settle the bonus once the spell set is complete. Called whenever a spell is
 * taken; does nothing until the last tier is in, and only ever applies once,
 * because spells are never lost.
 */
export function settleBuildBonus(world: World, slots: number): void {
  if (world.buildBonus !== null) return
  const bonus = bonusFor(world.weapons.map((weapon) => elementOf(weapon.def)), slots)
  if (!bonus) return
  world.buildBonus = bonus
  if (bonus.kind === 'pure') world.modifiers.push(...pureModifiers(bonus.element))
}

/**
 * Elemental Equilibrium: the damage multiplier for this hit, and the mark it
 * leaves. An enemy last hit by a different element, recently enough, takes
 * extra. Every hit then marks it with its own element, so alternating
 * elements keeps the bonus going and hammering with one doesn't.
 */
export function equilibriumMultiplier(world: World, enemy: Enemy, source: WeaponInstance | null): number {
  if (world.buildBonus?.kind !== 'prismatic' || !source) return 1
  const element = elementOf(source.def)
  if (!element) return 1

  const marked = enemy.markedBy !== undefined && enemy.markedUntil !== undefined && world.time < enemy.markedUntil
  const bonus = marked && enemy.markedBy !== element ? 1 + config.buildBonus.equilibriumBonus : 1

  enemy.markedBy = element
  enemy.markedUntil = world.time + config.buildBonus.equilibriumSeconds
  return bonus
}

const ELEMENT_NAMES: Record<string, string> = { fire: 'Fire', frost: 'Frost', lightning: 'Lightning' }

/** Player-facing name and one-line effect of a bonus. */
export function describeBonus(bonus: NonNullable<BuildBonus>): { name: string; effect: string } {
  if (bonus.kind === 'pure') {
    const name = ELEMENT_NAMES[bonus.element] ?? bonus.element
    return { name: `Pure ${name}`, effect: `+${Math.round(config.buildBonus.pureDamage * 100)}% ${bonus.element} damage` }
  }
  return {
    name: 'Prismatic',
    effect: `Elemental Equilibrium: enemies hit by one element take +${Math.round(config.buildBonus.equilibriumBonus * 100)}% from the others for ${config.buildBonus.equilibriumSeconds}s`,
  }
}

/**
 * What the spells so far are heading towards, for the HUD: the bonus still
 * possible, and how many of the spells it needs are in. Null once nothing is
 * possible any more, or before a second spell says anything.
 */
export function bonusProspect(world: World, slots: number): { bonus: NonNullable<BuildBonus>; have: number } | null {
  const elements = world.weapons.map((weapon) => elementOf(weapon.def))
  if (elements.length < 2 || elements.length >= slots || elements.some((element) => !element)) return null
  const distinct = new Set(elements)
  if (distinct.size === 1) return { bonus: { kind: 'pure', element: elements[0]! }, have: elements.length }
  if (distinct.size === elements.length) return { bonus: { kind: 'prismatic' }, have: elements.length }
  return null
}
