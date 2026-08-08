import type { Enemy, World } from './world'

/**
 * The single place an enemy loses health.
 *
 * Its own tiny module rather than a method or a corner of combat.ts, because
 * everything that hurts things routes through it — projectiles, novas, chains,
 * damage over time — and later so will "on kill" hooks like XP drops (step 4)
 * without any of those systems needing to know about each other. (spec 5.6)
 *
 * Dead enemies are left in the array and swept up at the end of the combat
 * step. Removing mid-iteration would invalidate the neighbour grid that the
 * chain currently jumping between them is using.
 */
export function damageEnemy(world: World, enemy: Enemy, amount: number): void {
  if (enemy.hp <= 0) return

  enemy.hp -= amount
  world.damageDealt += amount

  if (enemy.hp <= 0) {
    enemy.hp = 0
    world.kills++
  }
}
