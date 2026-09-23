import { config } from '../config'
import { findEnemyDef } from '../data/enemies'
import type { BlastDef, ChargeDef, FuseDef } from '../data/types'
import { hurtCharacter } from './damage'
import { damageEnemy } from './damageEnemy'
import { hpMultiplier } from './difficulty'
import { spawnEnemyAt } from './spawner'
import { slowMultiplier } from './statusEffects'
import { spawnRing, spawnSprite } from './vfx'
import type { Enemy, World } from './world'

/**
 * What enemies do besides walking at him: charge, blow up, and leave things
 * behind when they die.
 *
 * All of it is switched on by fields in an enemy's data entry (`charge`,
 * `fuse`, `onDeath`) and none of it is per-enemy code, so a new charger or a
 * new bomber is a data entry. The plain walk in enemyMovement.ts leaves alone
 * anything this file has busy.
 */

/** A patch of ground that hurts him while he stands in it — a Stinkcap's gas. */
export interface Hazard {
  x: number
  y: number
  radius: number
  /** Damage per second to him while inside. */
  dps: number
  remaining: number
  total: number
  colour: string
}

/**
 * Whether the ordinary walk should leave this one alone this step: it's
 * charging, or its fuse is lit. A lit bomb stops where it is — when it kept
 * chasing at nearly his pace, the blast caught him almost every time and fire
 * wisps did a quarter of all the damage he took.
 */
export function busy(enemy: Enemy): boolean {
  return enemy.mode !== undefined || enemy.fuseLeft !== undefined
}

/** Chargers, fuses and hazards. Runs before the walk. */
export function updateEnemyBehaviours(world: World, dt: number): void {
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) continue
    const { charge, fuse } = enemy.def
    if (charge) updateCharge(world, enemy, charge, dt)
    if (fuse) updateFuse(world, enemy, fuse, dt)
  }

  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const hazard = world.hazards[i]
    hazard.remaining -= dt
    if (hazard.remaining > 0) continue
    world.hazards[i] = world.hazards[world.hazards.length - 1]
    world.hazards.pop()
  }
}

/**
 * Walk, stop and paw the ground, charge in a straight line, stand dazed.
 *
 * The windup is the warning. It keeps turning to face him for most of it and
 * then commits, so the last moment before it goes is his chance to step out
 * of the lane — which is why the lane goes on the danger map (influence.ts)
 * as soon as the windup starts.
 */
function updateCharge(world: World, enemy: Enemy, charge: ChargeDef, dt: number): void {
  const c = world.character
  const dx = c.x - enemy.x
  const dy = c.y - enemy.y
  const distance = Math.hypot(dx, dy)
  // Staggered by id rather than rolled, so a herd doesn't all charge on one
  // beat and the run's random stream isn't touched.
  if (enemy.chargeReady === undefined) enemy.chargeReady = ((enemy.id % 7) / 7) * charge.cooldown

  switch (enemy.mode) {
    case undefined:
      enemy.chargeReady -= dt
      if (enemy.chargeReady > 0 || distance > charge.range || distance < 1) return
      enemy.mode = 'windup'
      enemy.modeTime = charge.windup
      enemy.dirX = dx / distance
      enemy.dirY = dy / distance
      return

    case 'windup': {
      const left = (enemy.modeTime ?? 0) - dt
      enemy.modeTime = left
      if (left > charge.windup * 0.3 && distance > 1) {
        enemy.dirX = dx / distance
        enemy.dirY = dy / distance
      }
      if (left > 0) return
      enemy.mode = 'charge'
      enemy.modeTime = charge.distance / charge.speed
      enemy.chargeHit = false
      return
    }

    case 'charge': {
      const step = charge.speed * slowMultiplier(enemy) * dt
      enemy.x += (enemy.dirX ?? 0) * step
      enemy.y += (enemy.dirY ?? 0) * step
      enemy.stride += step
      // One hit per charge, on top of ordinary contact: running through him
      // takes a tenth of a second, and contact damage alone would barely
      // register it.
      const reach = enemy.def.radius + c.radius
      if (!enemy.chargeHit && (c.x - enemy.x) ** 2 + (c.y - enemy.y) ** 2 <= reach * reach) {
        enemy.chargeHit = true
        hurtCharacter(world, charge.impact, `${enemy.def.displayName} charge`)
      }
      enemy.modeTime = (enemy.modeTime ?? 0) - dt
      if (enemy.modeTime > 0) return
      enemy.mode = 'recover'
      enemy.modeTime = charge.recover
      return
    }

    case 'recover':
      enemy.modeTime = (enemy.modeTime ?? 0) - dt
      if (enemy.modeTime > 0) return
      enemy.mode = undefined
      enemy.chargeReady = charge.cooldown
  }
}

/**
 * Close enough to him, it lights, stops and swells; when the fuse runs out,
 * it goes off where it stands. Killing it first is the answer. Going off isn't a kill — no XP,
 * no gold, and no death effects on top of the bang.
 */
function updateFuse(world: World, enemy: Enemy, fuse: FuseDef, dt: number): void {
  if (enemy.fuseLeft === undefined) {
    const c = world.character
    const reach = fuse.range + c.radius + enemy.def.radius
    if ((c.x - enemy.x) ** 2 + (c.y - enemy.y) ** 2 > reach * reach) return
    enemy.fuseLeft = fuse.seconds
  }
  enemy.fuseLeft -= dt
  if (enemy.fuseLeft > 0) return
  enemy.hp = 0
  blast(world, enemy.x, enemy.y, fuse, enemy.def.colour, enemy.def.displayName)
}

/**
 * A bang: hurts him if he's caught in it, and every enemy caught in it too.
 *
 * Enemies take it scaled like their health, so it stays a real threat to them
 * however late in the run it is — a chain of sporelings going up can clear a
 * crowd. Those kills are his, XP and gold included.
 */
export function blast(world: World, x: number, y: number, def: BlastDef, colour: string, source: string): void {
  const c = world.character
  const reach = def.radius + c.radius
  if ((c.x - x) ** 2 + (c.y - y) ** 2 <= reach * reach) {
    hurtCharacter(world, def.damage, `${source} blast`)
    world.blastsTaken++
  }

  const damage = def.damage * hpMultiplier(world.time) * config.enemies.blastEnemyScale
  for (const other of world.enemies) {
    if (other.hp <= 0) continue
    const r = def.radius + other.def.radius
    if ((other.x - x) ** 2 + (other.y - y) ** 2 > r * r) continue
    damageEnemy(world, other, damage, null)
  }

  spawnSprite(world, 'explosion', x, y, def.radius * 1.9, 0.55, true)
  spawnRing(world, x, y, def.radius, colour, 0.35)
}

/**
 * Death effects for everything killed this step: blasts, bursting into
 * smaller things, gas left on the ground.
 *
 * Run after the combat step, from a queue rather than at the moment of death.
 * A death that spawned enemies mid-fight would be adding to the array the
 * spells are walking, and a blast can kill things that blast in turn — the
 * queue simply keeps going until nothing new has died.
 */
export function resolveDeaths(world: World): void {
  // A backstop, not a limit anything should reach.
  for (let guard = 0; world.dying.length > 0 && guard < 2000; guard++) {
    const enemy = world.dying.shift()!
    const death = enemy.def.onDeath
    if (!death) continue

    if (death.explode) blast(world, enemy.x, enemy.y, death.explode, enemy.def.colour, enemy.def.displayName)

    if (death.hazard) {
      const { radius, dps, seconds, colour } = death.hazard
      world.hazards.push({ x: enemy.x, y: enemy.y, radius, dps, remaining: seconds, total: seconds, colour })
    }

    if (death.spawn) {
      const def = findEnemyDef(death.spawn.enemyId)
      if (!def) continue
      for (let i = 0; i < death.spawn.count; i++) {
        const angle = world.rng() * Math.PI * 2
        const r = Math.sqrt(world.rng()) * death.spawn.spread
        spawnEnemyAt(world, def, enemy.x + Math.cos(angle) * r, enemy.y + Math.sin(angle) * r)
      }
    }
  }
  world.dying.length = 0
}
