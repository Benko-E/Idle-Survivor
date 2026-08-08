import { config } from '../config'
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

  character.hp -= incoming * config.damage.contactScale * dt

  if (character.hp <= 0) {
    character.hp = 0
    world.state = 'dead'
  }
}
