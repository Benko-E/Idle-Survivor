import { config } from '../config'
import type { CastContext } from './behaviours'
import { damageEnemy } from './damageEnemy'
import { enemiesInRadius, nearestEnemy } from './targeting'
import type { Enemy, World } from './world'

/**
 * Beams: a line from the caster that holds an enemy and hurts it for as long
 * as it holds. Ray of Frost, and one day a warlock's Drain Life or a fire
 * Scorching Ray.
 *
 * A beam "casts" on a short tick, like the orbit and body spells: `cooldown`
 * is the tick, and `damage` is per second, dealt for the time since the last
 * tick. Between ticks it keeps its own state (BeamState, on the spell), which
 * the renderer draws every frame, following the enemies as they move.
 *
 * "Touched" is everything the beam is touching right now: its target, and
 * whatever it passes through. What its upgrades do, they do to everything
 * touched (spellbook). Its forks are plain: a share of the damage, nothing
 * else.
 */

export interface BeamState {
  /** The enemy it holds until it dies or leaves range. */
  target?: Enemy
  /** Everything it's touching this tick, nearest first. Empty while idle. */
  path: Enemy[]
  /** Plain forks off its target (Beam Fork), each to its own enemy. */
  forks: Enemy[]
  /** World time of its last tick, so each tick deals exactly the time since. */
  lastTick?: number
}

const scratch: Enemy[] = []

/** The beam behaviour, registered in sim/behaviours.ts. */
export function castBeam({ world, weapon, caster, stat }: CastContext): boolean {
  const state = (weapon.beam ??= { path: [], forks: [] })
  const range = stat('range')
  // The time this tick stands for: since the last one, while it's been
  // holding. Ticks land on whole frames, so a fixed share would come up short.
  const elapsed = state.lastTick === undefined ? stat('cooldown') : Math.min(world.time - state.lastTick, stat('cooldown') * 3)

  // Hold its enemy while it's alive and in reach; otherwise the nearest.
  const held = state.target
  const holding = held !== undefined && held.hp > 0 && (held.x - caster.x) ** 2 + (held.y - caster.y) ** 2 <= range * range
  state.target = holding ? held : (nearestEnemy(world, caster.x, caster.y, range) ?? undefined)
  state.path.length = 0
  state.forks.length = 0
  if (!state.target) {
    state.lastTick = undefined
    return false
  }
  state.lastTick = world.time

  const target = state.target
  state.path.push(target)
  pierceBehind(world, caster, target, Math.max(0, Math.round(stat('pierce'))), state.path)
  forkFrom(world, target, Math.max(0, Math.round(stat('fork'))), state)

  const damage = stat('damage') * elapsed
  for (const enemy of state.path) damageEnemy(world, enemy, damage, weapon)
  for (const enemy of state.forks) damageEnemy(world, enemy, damage * config.beam.forkShare, weapon)
  return true
}

/**
 * Beam Pierce: up to `count` enemies behind its target, on the line from him
 * through it and up to `beam.pierceReach` past it, nearest first.
 */
function pierceBehind(world: World, from: { x: number; y: number }, target: Enemy, count: number, path: Enemy[]): void {
  if (count <= 0) return
  const { pierceReach, width } = config.beam
  const length = Math.hypot(target.x - from.x, target.y - from.y) || 1
  const ux = (target.x - from.x) / length
  const uy = (target.y - from.y) / length
  const behind: { enemy: Enemy; along: number }[] = []
  for (const enemy of enemiesInRadius(world, target.x, target.y, pierceReach + width, scratch)) {
    if (enemy === target || enemy.hp <= 0) continue
    const dx = enemy.x - target.x
    const dy = enemy.y - target.y
    const along = dx * ux + dy * uy
    if (along <= 0 || along > pierceReach) continue
    const off = Math.abs(dx * uy - dy * ux)
    if (off > width + enemy.def.radius) continue
    behind.push({ enemy, along })
  }
  behind.sort((a, b) => a.along - b.along)
  for (let i = 0; i < Math.min(count, behind.length); i++) path.push(behind[i].enemy)
}

/** Beam Fork: plain beams off its target to the `count` nearest other enemies within `beam.forkRange`. */
function forkFrom(world: World, target: Enemy, count: number, state: BeamState): void {
  if (count <= 0) return
  const near = enemiesInRadius(world, target.x, target.y, config.beam.forkRange, scratch)
    .filter((enemy) => enemy.hp > 0 && !state.path.includes(enemy))
    .sort((a, b) => (a.x - target.x) ** 2 + (a.y - target.y) ** 2 - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2))
  for (let i = 0; i < Math.min(count, near.length); i++) state.forks.push(near[i])
}
