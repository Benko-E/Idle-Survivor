import { damageEnemy } from './damageEnemy'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * Lingering effects on enemies — damage over time, chills, curses.
 *
 * Kept generic on purpose. An effect is a kind, a magnitude and a remaining
 * duration; nothing here knows what Curse of Withering is, only that
 * something asked for 'dot' at 7 per second for 3.5 seconds.
 */

/**
 * dot   damage per second
 * slow  fraction of speed removed
 * root  can't move at all; magnitude unused
 */
export type EffectKind = 'dot' | 'slow' | 'root'

export interface StatusEffect {
  kind: EffectKind
  magnitude: number
  remaining: number
  /** The spell that applied it, credited with any damage it does. */
  source: WeaponInstance | null
}

/**
 * Reapplying an effect from the same spell refreshes its duration and keeps
 * the stronger magnitude, rather than stacking a second copy. Stacking makes
 * an area curse that reapplies every two seconds grow without limit, which is
 * a balance problem disguised as a feature.
 *
 * Effects from *different* spells sit side by side, so a cursed enemy
 * standing in Righteous Fire takes both. When they shared one slot, whichever
 * burned hotter silently cancelled the other.
 */
export function applyEffect(
  enemy: Enemy,
  kind: EffectKind,
  magnitude: number,
  duration: number,
  source: WeaponInstance | null,
): void {
  const existing = enemy.effects.find((effect) => effect.kind === kind && effect.source === source)
  if (existing) {
    existing.magnitude = Math.max(existing.magnitude, magnitude)
    existing.remaining = Math.max(existing.remaining, duration)
    return
  }
  enemy.effects.push({ kind, magnitude, remaining: duration, source })
}

/**
 * Speed multiplier from everything holding an enemy back: 0 when rooted,
 * otherwise the single strongest slow. Slows don't add together — two chills
 * at 45% would otherwise make 90% — and they're capped short of a stop, so
 * standing still stays the root's job.
 */
export function slowMultiplier(enemy: Enemy): number {
  let strongest = 0
  for (const effect of enemy.effects) {
    if (effect.kind === 'root') return 0
    if (effect.kind === 'slow' && effect.magnitude > strongest) strongest = effect.magnitude
  }
  return 1 - Math.min(0.9, strongest)
}

export function updateStatusEffects(world: World, dt: number): void {
  for (const enemy of world.enemies) {
    if (enemy.effects.length === 0) continue

    for (let i = enemy.effects.length - 1; i >= 0; i--) {
      const effect = enemy.effects[i]

      if (effect.kind === 'dot' && enemy.hp > 0) {
        damageEnemy(world, enemy, effect.magnitude * dt, effect.source)
      }

      effect.remaining -= dt
      if (effect.remaining <= 0) {
        enemy.effects[i] = enemy.effects[enemy.effects.length - 1]
        enemy.effects.pop()
      }
    }
  }
}
