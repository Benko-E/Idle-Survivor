import type { WeaponInstance, World } from './world'
import { weaponStat } from './stats'

/**
 * Where a circling spell's orbs are right now — Ball Lightning.
 *
 * Worked out from the clock rather than stored, so the orbs need no state of
 * their own: the behaviour that damages with them and the renderer that
 * draws them both ask here and always agree.
 */
export function orbitPositions(world: World, weapon: WeaponInstance): { x: number; y: number }[] {
  const count = Math.max(1, Math.round(weaponStat(world, weapon, 'count')))
  const radius = weaponStat(world, weapon, 'area')
  const turn = weaponStat(world, weapon, 'speed') * world.time
  const { x, y } = world.character
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const angle = turn + (i / count) * Math.PI * 2
    positions.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius })
  }
  return positions
}
