import { config } from '../config'
import { damageEnemy } from './damageEnemy'
import { forEachEnemyNear } from './enemyGrid'
import type { World } from './world'

/**
 * Travelling projectiles — the fireball half of the spellbook.
 *
 * Generic: a projectile is a position, a velocity, some damage and a pierce
 * count. It carries its caster's tags so that anything reacting to a hit
 * later (on-hit curses, elemental procs) can tell a firebolt from an ice
 * shard without this file knowing either exists.
 */

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  /** Extra enemies it passes through after the first. */
  pierce: number
  radius: number
  colour: string
  tags: readonly string[]
  /** Seconds left before it fizzles, from range / speed at spawn. */
  life: number
  /** Enemy ids already hit, so one pass can't tick the same target twice. */
  hits: Set<number>
}

export function updateProjectiles(world: World, dt: number): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const projectile = world.projectiles[i]

    projectile.x += projectile.vx * dt
    projectile.y += projectile.vy * dt
    projectile.life -= dt

    let spent = projectile.life <= 0

    if (!spent) {
      const reach = projectile.radius + config.combat.projectileHitPadding

      forEachEnemyNear(world, projectile.x, projectile.y, reach + 24, (enemy) => {
        if (spent) return
        if (projectile.hits.has(enemy.id)) return

        const dx = enemy.x - projectile.x
        const dy = enemy.y - projectile.y
        const hitRange = enemy.def.radius + reach
        if (dx * dx + dy * dy > hitRange * hitRange) return

        projectile.hits.add(enemy.id)
        damageEnemy(world, enemy, projectile.damage)

        if (projectile.pierce <= 0) spent = true
        else projectile.pierce--
      })
    }

    if (!spent) continue

    world.projectiles[i] = world.projectiles[world.projectiles.length - 1]
    world.projectiles.pop()
  }
}
