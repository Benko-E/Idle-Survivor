import { findCondition } from '../data/conditions'
import type { ConditionDef } from '../data/types'
import { damageEnemy } from './damageEnemy'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * Conditions on enemies — burning, chilled, frozen, shocked — while they last.
 *
 * What each condition *is* lives in data/conditions.ts; this file only knows
 * the four jobs a condition can do (damage, slow, hold, vulnerable) and the
 * two ways repeat applications combine. Nothing here knows what Righteous
 * Fire is, only that something asked for 'burning' at 10 a second for a
 * second.
 */

export interface StatusEffect {
  /** Which condition: an id from data/conditions.ts. */
  condition: string
  def: ConditionDef
  /** What the strength means depends on the condition's effect; see ConditionDef. */
  magnitude: number
  remaining: number
  /** The spell that applied it, credited with any damage it does. */
  source: WeaponInstance | null
}

/**
 * Behaviour a condition needs beyond its effect, keyed by condition id: a
 * bleed that only hurts while moving, a tomb that shatters when it ends.
 * Most conditions need nothing here.
 */
export interface ConditionHooks {
  /** Every step while it lasts, after its effect. */
  tick?(world: World, enemy: Enemy, effect: StatusEffect, dt: number): void
  /** When it wears off (not when the enemy dies with it on). */
  expire?(world: World, enemy: Enemy, effect: StatusEffect): void
}
export const CONDITION_HOOKS: Record<string, ConditionHooks> = {}

const warned = new Set<string>()

/**
 * Put a condition on an enemy.
 *
 * 'refresh' conditions: reapplying from the same spell tops up the time and
 * keeps the stronger of the two, rather than stacking a second copy — an area
 * spell reapplying every half second would otherwise grow without limit.
 * From a *different* spell it sits alongside, so an enemy burning from two
 * spells takes both. When they shared one slot, whichever burned hotter
 * silently cancelled the other.
 *
 * 'stack' conditions: every application is its own copy, up to maxStacks,
 * with the oldest dropped to make room.
 *
 * Nothing lands while the enemy is immune to it (ConditionDef.immuneAfter).
 */
export function applyCondition(
  world: World,
  enemy: Enemy,
  id: string,
  magnitude: number,
  duration: number,
  source: WeaponInstance | null,
): void {
  if (duration <= 0) return
  const def = findCondition(id)
  if (!def) {
    // A content bug, not a crash: say so once and carry on.
    if (!warned.has(id)) console.warn(`Unknown condition "${id}"`)
    warned.add(id)
    return
  }
  const immuneUntil = enemy.immuneUntil?.[id]
  if (immuneUntil !== undefined && world.time < immuneUntil) return

  if (def.stacking === 'refresh') {
    const existing = enemy.effects.find((effect) => effect.condition === id && effect.source === source)
    if (existing) {
      existing.magnitude = Math.max(existing.magnitude, magnitude)
      existing.remaining = Math.max(existing.remaining, duration)
      return
    }
  } else {
    const max = Math.max(1, def.maxStacks ?? Infinity)
    let count = 0
    let oldest = -1
    for (let i = 0; i < enemy.effects.length; i++) {
      if (enemy.effects[i].condition !== id) continue
      count++
      if (oldest < 0 || enemy.effects[i].remaining < enemy.effects[oldest].remaining) oldest = i
    }
    if (count >= max && oldest >= 0) enemy.effects.splice(oldest, 1)
  }

  enemy.effects.push({ condition: id, def, magnitude, remaining: duration, source })
}

export function hasCondition(enemy: Enemy, id: string): boolean {
  for (const effect of enemy.effects) if (effect.condition === id) return true
  return false
}

/** How many copies of a condition an enemy has — stacks of poison, burns from different spells. */
export function conditionCount(enemy: Enemy, id: string): number {
  let count = 0
  for (const effect of enemy.effects) if (effect.condition === id) count++
  return count
}

/**
 * Speed multiplier from everything holding an enemy back: 0 when frozen,
 * rooted or anything else that holds, otherwise the single strongest slow.
 * Slows don't add together — two chills at 45% would otherwise make 90% —
 * and they're capped short of a stop, so standing still stays the job of a
 * condition that holds.
 */
export function slowMultiplier(enemy: Enemy): number {
  let strongest = 0
  for (const effect of enemy.effects) {
    if (effect.def.effect === 'hold') return 0
    if (effect.def.effect === 'slow' && effect.magnitude > strongest) strongest = effect.magnitude
  }
  return 1 - Math.min(0.9, strongest)
}

/** Whether something is holding it in place. Its feet stop too. */
export function isHeld(enemy: Enemy): boolean {
  for (const effect of enemy.effects) if (effect.def.effect === 'hold') return true
  return false
}

/**
 * Damage multiplier from being made vulnerable — shocked, and anything like
 * it. The strongest one counts, for the same reason slows don't add up.
 */
export function vulnerability(enemy: Enemy): number {
  let strongest = 0
  for (const effect of enemy.effects) {
    if (effect.def.effect === 'vulnerable' && effect.magnitude > strongest) strongest = effect.magnitude
  }
  return 1 + strongest
}

export function updateStatusEffects(world: World, dt: number): void {
  for (const enemy of world.enemies) {
    if (enemy.effects.length === 0) continue

    for (let i = enemy.effects.length - 1; i >= 0; i--) {
      const effect = enemy.effects[i]
      if (enemy.hp <= 0) break

      if (effect.def.effect === 'damage') damageEnemy(world, enemy, effect.magnitude * dt, effect.source, true)
      CONDITION_HOOKS[effect.condition]?.tick?.(world, enemy, effect, dt)

      effect.remaining -= dt
      if (effect.remaining > 0) continue
      enemy.effects[i] = enemy.effects[enemy.effects.length - 1]
      enemy.effects.pop()
      CONDITION_HOOKS[effect.condition]?.expire?.(world, enemy, effect)
      // Immunity starts once the last copy is gone, not the first.
      if (effect.def.immuneAfter && !hasCondition(enemy, effect.condition)) {
        ;(enemy.immuneUntil ??= {})[effect.condition] = world.time + effect.def.immuneAfter
      }
    }
  }
}
