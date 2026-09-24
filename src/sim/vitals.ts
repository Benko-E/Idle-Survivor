import { characterStat } from './stats'
import type { World } from './world'

/**
 * His health ceiling and his healing, both read through the stat system.
 *
 * Max health is re-resolved every step rather than fixed at the start of a
 * run, so an upgrade, a piece of gear or a debug-panel edit takes effect the
 * moment it happens. Growing it heals by the amount gained — "+20 max health"
 * that arrived as an empty bar would feel like nothing happened. Shrinking it
 * only clips current health to fit.
 */
export function updateVitals(world: World, dt: number): void {
  if (world.state !== 'running') return
  const character = world.character

  const maxHp = Math.max(1, characterStat(world, 'maxHp', world.classDef.stats.maxHp))
  if (maxHp > character.maxHp) character.hp += maxHp - character.maxHp
  character.maxHp = maxHp

  const regen = characterStat(world, 'hpRegen', world.classDef.stats.hpRegen)
  if (regen > 0) character.hp += regen * dt

  if (character.hp > maxHp) character.hp = maxHp
}
