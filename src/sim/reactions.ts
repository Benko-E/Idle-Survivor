import { config } from '../config'
import { spawnPlainBolt } from './projectiles'
import { weaponStat } from './stats'
import { applyCondition } from './statusEffects'
import type { WeaponInstance, World } from './world'

/**
 * What his spells do the moment an enemy hurts him: Backdraft's ring of
 * bolts, Cold Shoulder's freeze. Each has a wait of its own, so a crowd
 * nibbling at him can't set it off every frame.
 *
 * "Hurt" is world.lastHurtAt, which his own fire (Zealot's Pyre) never sets.
 */
export function updateReactions(world: World): void {
  if (world.state !== 'running' || world.time - world.lastHurtAt > 0.05) return
  for (const weapon of world.weapons) {
    if (!weapon.def.enabled) continue
    backdraft(world, weapon)
    coldShoulder(world, weapon)
  }
}

/** Backdraft: a ring of plain bolts out of him, then combat.backdraftCooldown. */
function backdraft(world: World, weapon: WeaponInstance): void {
  const bolts = Math.round(weaponStat(world, weapon, 'backdraft'))
  if (bolts <= 0 || world.time < (weapon.backdraftReady ?? 0)) return
  weapon.backdraftReady = world.time + config.combat.backdraftCooldown
  const { x, y } = world.character
  const damage = weaponStat(world, weapon, 'damage')
  const offset = world.rng() * Math.PI * 2
  for (let i = 0; i < bolts; i++) {
    spawnPlainBolt(world, weapon, x, y, offset + (i / bolts) * Math.PI * 2, damage, weaponStat(world, weapon, 'range') * 0.6)
  }
}

/** Cold Shoulder: every enemy touching him freezes for `coldShoulder` seconds, then beam.coldShoulderCooldown. */
function coldShoulder(world: World, weapon: WeaponInstance): void {
  const seconds = weaponStat(world, weapon, 'coldShoulder')
  if (seconds <= 0 || world.time < (weapon.coldShoulderReady ?? 0)) return
  weapon.coldShoulderReady = world.time + config.beam.coldShoulderCooldown
  const c = world.character
  for (const enemy of world.enemies) {
    const reach = enemy.def.radius + c.radius
    if (enemy.hp > 0 && (enemy.x - c.x) ** 2 + (enemy.y - c.y) ** 2 <= reach * reach) applyCondition(world, enemy, 'frozen', 1, seconds, weapon)
  }
}
