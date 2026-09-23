import { config } from '../config'
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

    const landed = behaviour({
      world,
      weapon,
      def: weapon.def,
      stat: (key) => weaponStat(world, weapon, key),
    })

    if (!landed) {
      // Nothing in reach. Stay ready and look again shortly, rather than
      // spending the whole cooldown on thin air. The short wait keeps an
      // out-of-range spell from re-querying the neighbour grid every frame.
      weapon.cooldownRemaining = config.combat.retrySeconds
      weapon.idleSeconds += config.combat.retrySeconds
      continue
    }

    weapon.timesCast++

    // Cooldown divided by a recovery *rate*, rather than shortened by a
    // percentage. Percentage reductions add up in a straight line: five picks
    // of -12% made -60%, and a little gear on top would have reached -100%
    // and a spell with no cooldown at all. As a rate, +100% recovery halves
    // the wait and +200% thirds it — every pick still helps, less each time,
    // and it can never reach zero. The floor is only a last-ditch backstop.
    const recovery = Math.max(0.1, weaponStat(world, weapon, 'cooldownRecovery', 1))
    weapon.cooldownRemaining = Math.max(0.05, weaponStat(world, weapon, 'cooldown') / recovery)
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
