import type { CastContext } from './behaviours'
import { damageEnemy } from './damageEnemy'
import { nearestEnemy } from './targeting'
import type { Enemy } from './world'

/**
 * Beams: a line from the caster that holds an enemy and hurts it for as long
 * as it holds. Ray of Frost, and one day a warlock's Drain Life or a fire
 * Scorching Ray.
 *
 * A beam "casts" on a short tick, like the orbit and body spells: `cooldown`
 * is the tick, and `damage` is per second, dealt a tick's worth at a time.
 * Between ticks it keeps its own state (BeamState, on the spell), which the
 * renderer draws every frame, following the enemies as they move.
 *
 * "Touched" is everything the beam is touching right now: its target, and
 * whatever it passes through. What its upgrades do, they do to everything
 * touched (spellbook).
 */

export interface BeamState {
  /** The enemy it holds until it dies or leaves range. */
  target?: Enemy
  /** Everything it's touching this tick, nearest first. Empty while idle. */
  path: Enemy[]
  /** World time of its last tick, so each tick deals exactly the time since. */
  lastTick?: number
}

/** The beam behaviour, registered in sim/behaviours.ts. */
export function castBeam({ world, weapon, caster, stat }: CastContext): boolean {
  const state = (weapon.beam ??= { path: [] })
  const range = stat('range')
  // The time this tick stands for: since the last one, while it's been
  // holding. Ticks land on whole frames, so a fixed share would come up short.
  const elapsed = state.lastTick === undefined ? stat('cooldown') : Math.min(world.time - state.lastTick, stat('cooldown') * 3)

  // Hold its enemy while it's alive and in reach; otherwise the nearest.
  const held = state.target
  const holding = held !== undefined && held.hp > 0 && (held.x - caster.x) ** 2 + (held.y - caster.y) ** 2 <= range * range
  state.target = holding ? held : (nearestEnemy(world, caster.x, caster.y, range) ?? undefined)
  if (!state.target) {
    state.path.length = 0
    state.lastTick = undefined
    return false
  }
  state.lastTick = world.time

  state.path.length = 0
  state.path.push(state.target)

  const damage = stat('damage') * elapsed
  for (const enemy of state.path) damageEnemy(world, enemy, damage, weapon)
  return true
}
