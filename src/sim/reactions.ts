import { config } from '../config'
import { spawnPlainBolt } from './projectiles'
import { weaponStat } from './stats'
import { applyCondition } from './statusEffects'
import { enemiesInRadius } from './targeting'
import { HIT_SPARK_SECONDS, HIT_SPARK_SIZE, spawnArtLine, spawnSprite } from './vfx'
import { damageEnemy } from './damageEnemy'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * What his spells do the moment an enemy hurts him: Backdraft's ring of
 * bolts, Cold Shoulder's freeze, Static Discharge's arcs. Each has a wait of
 * its own, so a crowd nibbling at him can't set it off every frame.
 *
 * "Hurt" is world.lastHurtAt, which his own fire (Zealot's Pyre) never sets.
 */
export function updateReactions(world: World): void {
  if (world.state !== 'running' || world.time - world.lastHurtAt > 0.05) return
  for (const weapon of world.weapons) {
    if (!weapon.def.enabled) continue
    backdraft(world, weapon)
    coldShoulder(world, weapon)
    staticDischarge(world, weapon)
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

/**
 * Cold Shoulder: every enemy touching him freezes for `coldShoulder` seconds,
 * then beam.coldShoulderCooldown. Hurt with nobody touching him (a bolt from
 * afar) it keeps its charge rather than wasting its wait on nothing.
 */
function coldShoulder(world: World, weapon: WeaponInstance): void {
  const seconds = weaponStat(world, weapon, 'coldShoulder')
  if (seconds <= 0 || world.time < (weapon.coldShoulderReady ?? 0)) return
  const c = world.character
  const touching = world.enemies.filter((enemy) => {
    const reach = enemy.def.radius + c.radius
    return enemy.hp > 0 && (enemy.x - c.x) ** 2 + (enemy.y - c.y) ** 2 <= reach * reach
  })
  if (touching.length === 0) return
  weapon.coldShoulderReady = world.time + config.beam.coldShoulderCooldown
  for (const enemy of touching) applyCondition(world, enemy, 'frozen', 1, seconds, weapon)
}

const scratch: Enemy[] = []

/**
 * Static Discharge: lightning bursts out of him into the `staticDischarge`
 * nearest enemies within chain.staticRange, then chain.staticCooldown. Plain
 * arcs: his base hit, none of the spell's upgrades (no Shock, no Crescendo).
 * Hurt with nobody close (a bolt from afar) it keeps its charge.
 */
function staticDischarge(world: World, weapon: WeaponInstance): void {
  const arcs = Math.round(weaponStat(world, weapon, 'staticDischarge'))
  if (arcs <= 0 || world.time < (weapon.staticReady ?? 0)) return
  const c = world.character
  const near = enemiesInRadius(world, c.x, c.y, config.chain.staticRange, scratch)
    .filter((enemy) => enemy.hp > 0)
    .sort((a, b) => (a.x - c.x) ** 2 + (a.y - c.y) ** 2 - ((b.x - c.x) ** 2 + (b.y - c.y) ** 2))
  if (near.length === 0) return
  weapon.staticReady = world.time + config.chain.staticCooldown
  const damage = weaponStat(world, weapon, 'damage')
  for (const enemy of near.slice(0, arcs)) {
    damageEnemy(world, enemy, damage, weapon)
    spawnArtLine(world, c.x, c.y, enemy.x, enemy.y, weapon.def.colour, config.combat.lineVfxSeconds, weapon.def.fx?.arc)
    if (weapon.def.fx?.hit) spawnSprite(world, weapon.def.fx.hit, enemy.x, enemy.y, HIT_SPARK_SIZE, HIT_SPARK_SECONDS, false)
  }
}
