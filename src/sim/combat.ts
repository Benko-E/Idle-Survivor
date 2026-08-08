import { BEHAVIOURS } from './behaviours'
import { updateProjectiles } from './projectiles'
import { weaponStat } from './stats'
import { updateStatusEffects } from './statusEffects'
import { updateVfx } from './vfx'
import type { World } from './world'

/**
 * Runs the character's spellbook.
 *
 * Cooldowns tick down, ready spells cast, everything they created resolves,
 * and the dead get swept up. There is no branch on which spell is which —
 * that lookup is a string into the behaviour registry.
 */

function castReadySpells(world: World, dt: number): void {
  for (const weapon of world.weapons) {
    weapon.cooldownRemaining -= dt
    if (weapon.cooldownRemaining > 0) continue

    const behaviour = BEHAVIOURS[weapon.def.behaviour]
    if (!behaviour) {
      // A data entry naming a behaviour that doesn't exist is a content bug,
      // not a crash. Park the spell rather than retrying it 60 times a second.
      console.warn(`Unknown behaviour "${weapon.def.behaviour}" on ${weapon.def.id}`)
      weapon.cooldownRemaining = Number.POSITIVE_INFINITY
      continue
    }

    behaviour({
      world,
      def: weapon.def,
      stat: (key) => weaponStat(world, weapon, key),
    })

    weapon.timesCast++

    // Set from the resolved cooldown rather than accumulating, and floored, so
    // a heavily stacked cast-speed build can't drive it to zero or negative.
    weapon.cooldownRemaining = Math.max(0.05, weaponStat(world, weapon, 'cooldown'))
  }
}

/**
 * Sweep out everything killed this step.
 *
 * Deferred to the very end for a reason: the neighbour grid holds array
 * indices, and a chain mid-jump or a projectile mid-pierce is still walking
 * that grid. Removing during the fight would shuffle entries underneath them.
 */
function removeDead(world: World): void {
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    if (world.enemies[i].hp > 0) continue
    world.enemies[i] = world.enemies[world.enemies.length - 1]
    world.enemies.pop()
  }
}

export function updateCombat(world: World, dt: number): void {
  castReadySpells(world, dt)
  updateProjectiles(world, dt)
  updateStatusEffects(world, dt)
  updateVfx(world, dt)
  removeDead(world)
}
