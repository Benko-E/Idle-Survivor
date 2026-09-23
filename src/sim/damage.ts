import { config } from '../config'
import { gameEvents } from './events'
import { characterStat } from './stats'
import type { World } from './world'

/**
 * Contact damage and death. (spec B)
 *
 * Damage is continuous — every enemy overlapping the character deals its
 * contactDamage per second for as long as it's touching. No invulnerability
 * frames, deliberately: with i-frames a single fast enemy and a wall of thirty
 * do identical damage, and the whole point of the movement AI is that being
 * surrounded should be much worse than being clipped once.
 */
export function updateContactDamage(world: World, dt: number): void {
  const character = world.character
  let incoming = 0

  for (const enemy of world.enemies) {
    const dx = enemy.x - character.x
    const dy = enemy.y - character.y
    const reach = enemy.def.radius + character.radius
    if (dx * dx + dy * dy > reach * reach) continue

    incoming += enemy.def.contactDamage
  }

  world.incomingDps = incoming
  if (incoming === 0) return

  // A multiplier stat, so "take 10% less damage" picks compound rather than
  // adding up: four of them leave him taking 66%, never 60% less and never
  // invulnerable.
  const taken = characterStat(world, 'damageTaken', 1)
  character.hp -= incoming * config.damage.contactScale * taken * dt

  if (character.hp <= 0) {
    character.hp = 0
    world.state = 'dead'
    gameEvents.emit('died', { time: world.time, goldLost: world.gold })
  }
}
