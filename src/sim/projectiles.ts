import { config } from '../config'
import { damageEnemy } from './damageEnemy'
import { forEachEnemyNear, LARGEST_ENEMY_RADIUS } from './enemyGrid'
import { applyCondition } from './statusEffects'
import { HIT_SPARK_SECONDS, HIT_SPARK_SIZE, spawnSprite } from './vfx'
import type { WeaponInstance, World } from './world'

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
  /** The spell that fired it. */
  source: WeaponInstance
  /**
   * Lingering effect left on whatever it hits — a chill, a burn — or none.
   * Resolved at the moment of casting, like the damage.
   */
  /** A condition left on everything it hits, by id; see data/conditions.ts. */
  onHit: { condition: string; magnitude: number; duration: number } | null
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

      forEachEnemyNear(world, projectile.x, projectile.y, reach + LARGEST_ENEMY_RADIUS, (enemy) => {
        if (spent) return
        if (projectile.hits.has(enemy.id)) return

        const dx = enemy.x - projectile.x
        const dy = enemy.y - projectile.y
        const hitRange = enemy.def.radius + reach
        if (dx * dx + dy * dy > hitRange * hitRange) return

        projectile.hits.add(enemy.id)
        damageEnemy(world, enemy, projectile.damage, projectile.source)
        const spark = projectile.source.def.fx?.hit
        if (spark) spawnSprite(world, spark, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)
        const onHit = projectile.onHit
        if (onHit && enemy.hp > 0) applyCondition(world, enemy, onHit.condition, onHit.magnitude, onHit.duration, projectile.source)

        if (projectile.pierce <= 0) spent = true
        else projectile.pierce--
      })
    }

    if (!spent) continue

    world.projectiles[i] = world.projectiles[world.projectiles.length - 1]
    world.projectiles.pop()
  }
}
