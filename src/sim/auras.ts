import { config } from '../config'
import { hurtCharacter } from './damage'
import { damageEnemy } from './damageEnemy'
import { weaponStat } from './stats'
import { CONDITION_HOOKS, type StatusEffect } from './statusEffects'
import { enemiesInRadius } from './targeting'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * What an aura spell can be upgraded to do — Righteous Fire's kit, kept as
 * aura stats so any aura spell could be given the same things with data:
 *
 *   zeal        0..1, how much of his fear of close enemies he sets aside
 *               while he has it, so they walk into the burn (influence.ts)
 *   selfBurn    health a second it costs him while its pyre is lit
 *   pyreDamage  extra damage while its pyre is lit, as a fraction
 *   fervour     extra damage the lower his health, as a fraction at 0 health
 *   feed        radius gained per kill inside it, as a fraction, for a while
 *   consume     health back per kill inside it
 *   beacon      extra fire damage taken by everything inside, as a fraction
 *   zealotry    everything inside carries a little aura of its own
 *
 * Numbers that aren't upgrades — the pyre's on and off health, how feeding
 * eases — are under `aura` in the config.
 */

/** Is this weapon an aura, the spells these rules are for. */
export function isAura(weapon: WeaponInstance): boolean {
  return weapon.def.behaviour === 'aura'
}

/**
 * Whether its pyre is lit: it has self-burn, and his health hasn't dropped
 * below the off point since it was last relit at the on point. Only the
 * pyre goes out — the aura burns on as usual.
 */
export function pyreLit(world: World, weapon: WeaponInstance): boolean {
  return weaponStat(world, weapon, 'selfBurn') > 0 && weapon.pyreOut !== true
}

/** The aura's radius right now, including what kills have fed it. */
export function auraRadius(world: World, weapon: WeaponInstance): number {
  return weaponStat(world, weapon, 'area') * (1 + (weapon.feed?.current ?? 0))
}

/** Its burn right now: base, hotter with its pyre lit, hotter the more hurt he is. */
export function auraBurn(world: World, weapon: WeaponInstance): number {
  const c = world.character
  const missing = Math.max(0, 1 - c.hp / Math.max(1, c.maxHp))
  const pyre = pyreLit(world, weapon) ? weaponStat(world, weapon, 'pyreDamage') : 0
  const fervour = weaponStat(world, weapon, 'fervour') * missing
  return weaponStat(world, weapon, 'dotDamage') * (1 + pyre) * (1 + fervour)
}

/** How much of his fear of close enemies his auras let him set aside. */
export function zealOf(world: World): number {
  let zeal = 0
  for (const weapon of world.weapons) {
    if (weapon.def.enabled && isAura(weapon)) zeal = Math.max(zeal, weaponStat(world, weapon, 'zeal'))
  }
  return Math.min(0.9, zeal)
}

/** Every step: pyres lit and put out by his health, and what kills have fed eases in and out. */
export function updateAuras(world: World, dt: number): void {
  // Registered here rather than at load: this module and statusEffects.ts
  // import each other's neighbours, and a hook added at load could run
  // before the table it goes in exists.
  CONDITION_HOOKS.zealotry ??= zealotryHook
  if (world.state !== 'running') return
  const c = world.character
  const health = c.hp / Math.max(1, c.maxHp)
  const { pyreOffAt, pyreOnAt, feedEase } = config.aura
  for (const weapon of world.weapons) {
    if (!weapon.def.enabled || !isAura(weapon)) continue

    const selfBurn = weaponStat(world, weapon, 'selfBurn')
    if (selfBurn > 0) {
      if (!weapon.pyreOut && health < pyreOffAt) weapon.pyreOut = true
      else if (weapon.pyreOut && health >= pyreOnAt - 1e-9) weapon.pyreOut = false
      if (!weapon.pyreOut) hurtCharacter(world, selfBurn * dt, "Zealot's Pyre", true)
    }

    const feed = weapon.feed
    if (feed) {
      feed.timer -= dt
      if (feed.timer <= 0) feed.target = 0
      // Eased both ways, so it swells and settles instead of snapping.
      feed.current += (feed.target - feed.current) * (1 - Math.exp(-feedEase * dt))
    }
  }
}

/**
 * A kill, wherever it came from: if it died inside an aura, the aura feeds
 * on it and he's healed for it.
 */
export function auraKill(world: World, enemy: Enemy): void {
  const c = world.character
  for (const weapon of world.weapons) {
    if (!weapon.def.enabled || !isAura(weapon)) continue
    const radius = auraRadius(world, weapon)
    if ((enemy.x - c.x) ** 2 + (enemy.y - c.y) ** 2 > radius * radius) continue

    const heal = weaponStat(world, weapon, 'consume')
    if (heal > 0) c.hp = Math.min(c.maxHp, c.hp + heal)

    const feed = weaponStat(world, weapon, 'feed')
    if (feed > 0) {
      const { feedSeconds, feedMaxSeconds, feedMaxBonus } = config.aura
      const state = (weapon.feed ??= { target: 0, current: 0, timer: 0 })
      state.target = Math.min(feedMaxBonus, state.target + feed)
      state.timer = Math.min(feedMaxSeconds, state.timer + feedSeconds)
    }
  }
}

const scratch: Enemy[] = []
/** Neighbours count as touched when their edge is in reach, not only their middle. */
const NEIGHBOUR_PAD = 8

/**
 * Zealotry: an enemy inside the aura carries a little one of its own, just
 * past its own size. It burns the carrier (the condition's own damage) and,
 * here, everything touching it — including him.
 */
const zealotryHook = {
  tick(world: World, enemy: Enemy, effect: StatusEffect, dt: number) {
    const reach = enemy.def.radius * config.aura.zealotryReach
    for (const other of enemiesInRadius(world, enemy.x, enemy.y, reach + NEIGHBOUR_PAD, scratch)) {
      if (other === enemy || other.hp <= 0) continue
      damageEnemy(world, other, effect.magnitude * dt, effect.source, true)
    }
    const c = world.character
    const touch = reach + c.radius
    if ((c.x - enemy.x) ** 2 + (c.y - enemy.y) ** 2 <= touch * touch) {
      hurtCharacter(world, effect.magnitude * config.aura.zealotryToHim * dt, 'Zealotry', true)
    }
  },
}