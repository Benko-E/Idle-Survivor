import { damageEnemy } from './damageEnemy'
import type { Enemy, World } from './world'

/**
 * Lingering effects on enemies — damage over time, chills, curses.
 *
 * Kept generic on purpose. An effect is a kind, a magnitude and a remaining
 * duration; nothing here knows what Curse of Withering is, only that
 * something asked for 'dot' at 7 per second for 3.5 seconds.
 */

export type EffectKind = 'dot' | 'slow'

export interface StatusEffect {
  kind: EffectKind
  magnitude: number
  remaining: number
}

/**
 * Reapplying an effect refreshes its duration and keeps the stronger
 * magnitude, rather than stacking a second copy. Stacking makes an area curse
 * that reapplies every two seconds grow without limit, which is a balance
 * problem disguised as a feature.
 */
export function applyEffect(enemy: Enemy, kind: EffectKind, magnitude: number, duration: number): void {
  const existing = enemy.effects.find((effect) => effect.kind === kind)
  if (existing) {
    existing.magnitude = Math.max(existing.magnitude, magnitude)
    existing.remaining = Math.max(existing.remaining, duration)
    return
  }
  enemy.effects.push({ kind, magnitude, remaining: duration })
}

/** Combined slow from every 'slow' effect, as a speed multiplier in (0, 1]. */
export function slowMultiplier(enemy: Enemy): number {
  let strongest = 0
  for (const effect of enemy.effects) {
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
        damageEnemy(world, enemy, effect.magnitude * dt)
      }

      effect.remaining -= dt
      if (effect.remaining <= 0) {
        enemy.effects[i] = enemy.effects[enemy.effects.length - 1]
        enemy.effects.pop()
      }
    }
  }
}
