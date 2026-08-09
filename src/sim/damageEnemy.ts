import { rollDrops } from './drops'
import { grantXp } from './progression'
import { characterStat } from './stats'
import type { Enemy, World } from './world'

/**
 * The single place an enemy loses health.
 *
 * Its own tiny module rather than a method or a corner of combat.ts, because
 * everything that hurts things routes through it — projectiles, novas, chains,
 * damage over time — and so does everything that should happen on a kill.
 *
 * Right now that's one consumer, so it's a direct call. If a second thing ever
 * needs to know about deaths (life steal, corpses that explode, a kill
 * counter for a quest) this becomes the place to emit an event instead. One
 * consumer does not justify an event bus. (spec 5.6)
 *
 * Dead enemies are left in the array and swept up at the end of the combat
 * step. Removing mid-iteration would invalidate the neighbour grid that the
 * chain currently jumping between them is using.
 */
export function damageEnemy(world: World, enemy: Enemy, amount: number): void {
  if (enemy.hp <= 0) return

  enemy.hp -= amount
  world.damageDealt += amount

  if (enemy.hp > 0) return

  enemy.hp = 0
  world.kills++

  // XP is awarded here rather than dropped, so it can never be left on the
  // floor. Tagged with the enemy's own tags, which is what makes a future
  // "+20% XP from undead" possible with no code.
  grantXp(world, characterStat(world, 'xpGain', enemy.def.xpValue, enemy.def.tags))

  rollDrops(world, enemy)
}
