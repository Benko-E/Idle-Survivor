import { config } from '../config'
import type { CastContext } from './behaviours'
import { damageEnemy } from './damageEnemy'
import { applyCondition, isHeld, setCondition } from './statusEffects'
import { enemiesInRadius } from './targeting'
import type { Enemy, WeaponInstance, World } from './world'

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
 *
 * Its upgrades are stats, so any beam could be given them:
 *   pierce         enemies behind its target it also touches
 *   fork           plain beams off its target
 *   frostbite      chill that grows while touched, freezing at beam.freezeSeconds
 *   flashFreeze    frozen enemies don't hold it: it moves on, and passes through them free
 *   wintersBreath  world units a second it pushes what it touches away from him
 *   coldSnap       seconds between freezing everything it touches outright
 */

export interface BeamState {
  /** The enemy it holds until it dies or leaves range. */
  target?: Enemy
  /** Everything it's touching this tick, nearest first. Empty while idle. */
  path: Enemy[]
  /** Plain forks off its target (Beam Fork), each to its own enemy. */
  forks: Enemy[]
  /**
   * Frostbite: how many seconds' cold each enemy has, by id, and once the
   * beam has left it, how fast that cold drains.
   */
  cold: Map<number, { enemy: Enemy; seconds: number; fade?: number }>
  /** Cold Snap: seconds until it next goes off. */
  snapTimer?: number
  /** Cold Snap's white flash lasts until this world time. */
  flashUntil: number
  /** World time of its last tick while holding, so each tick deals exactly the time since. */
  lastTick?: number
  /** World time of its last tick at all, for the cold that fades while it's idle too. */
  lastUpdate?: number
}

const scratch: Enemy[] = []

/** The beam behaviour, registered in sim/behaviours.ts. */
export function castBeam({ world, weapon, caster, stat }: CastContext): boolean {
  const state: BeamState = (weapon.beam ??= { path: [], forks: [], cold: new Map(), flashUntil: 0 })
  const range = stat('range')
  const tick = stat('cooldown')
  // The time this tick stands for. Ticks land on whole frames, so a fixed
  // share would come up short.
  const elapsed = state.lastTick === undefined ? tick : Math.min(world.time - state.lastTick, tick * 3)
  const sinceUpdate = state.lastUpdate === undefined ? tick : Math.min(world.time - state.lastUpdate, 0.5)
  state.lastUpdate = world.time

  const flashFreeze = stat('flashFreeze') > 0
  state.target = chooseTarget(world, caster, range, state.target, flashFreeze)
  state.path.length = 0
  state.forks.length = 0

  if (state.target) {
    state.lastTick = world.time
    const target = state.target
    state.path.push(target)
    pierceBehind(world, caster, target, Math.max(0, Math.round(stat('pierce'))), flashFreeze, state.path)
    forkFrom(world, target, Math.max(0, Math.round(stat('fork'))), state)

    // Continuous damage, like a burn, not a string of hits: a hit makes an
    // enemy flash white, and ten a second would be a strobe.
    const damage = stat('damage') * elapsed
    for (const enemy of state.path) damageEnemy(world, enemy, damage, weapon, true)
    for (const enemy of state.forks) damageEnemy(world, enemy, damage * config.beam.forkShare, weapon, true)

    push(caster, state.path, stat('wintersBreath') * elapsed)
    coldSnap(world, weapon, state, stat('coldSnap'), elapsed)

    // Frozen means frozen while touched, then beam.frozenLinger (spellbook):
    // whatever froze it — Frostbite, Cold Snap — the beam keeps it frozen.
    for (const enemy of state.path) {
      if (enemy.effects.some((effect) => effect.condition === 'frozen' && effect.source === weapon)) {
        applyCondition(world, enemy, 'frozen', 1, config.beam.frozenLinger + 0.15, weapon)
      }
    }
  } else {
    state.lastTick = undefined
  }

  // Frostbite's cold grows on what it touches and fades on the rest, idle or not.
  if (stat('frostbite') > 0 || state.cold.size > 0) frostbite(world, weapon, state, stat('frostbite') > 0, sinceUpdate)
  return state.target !== undefined
}

/**
 * Hold its enemy while it's alive and in reach, otherwise the nearest. With
 * Flash Freeze a frozen enemy doesn't hold it: it moves to the nearest one
 * that isn't frozen, and only stays if there's none.
 */
function chooseTarget(world: World, from: { x: number; y: number }, range: number, held: Enemy | undefined, flashFreeze: boolean): Enemy | undefined {
  const inReach = (enemy: Enemy) => enemy.hp > 0 && (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2 <= range * range
  const keep = held !== undefined && inReach(held) ? held : undefined
  if (keep && !(flashFreeze && isHeld(keep))) return keep

  let best: Enemy | undefined
  let bestDistance = Infinity
  for (const enemy of enemiesInRadius(world, from.x, from.y, range, scratch)) {
    if (enemy.hp <= 0 || (flashFreeze && isHeld(enemy))) continue
    const distance = (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = enemy
    }
  }
  if (best) return best
  // Nothing unfrozen: stay where it is (or take the nearest frozen one).
  if (keep) return keep
  for (const enemy of enemiesInRadius(world, from.x, from.y, range, scratch)) {
    const distance = (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2
    if (enemy.hp > 0 && distance < bestDistance) {
      bestDistance = distance
      best = enemy
    }
  }
  return best
}

/**
 * Beam Pierce: up to `count` enemies behind its target, on the line from him
 * through it and up to `beam.pierceReach` past it, nearest first. With Flash
 * Freeze, frozen ones are passed through free: touched, but not counted.
 */
function pierceBehind(world: World, from: { x: number; y: number }, target: Enemy, count: number, flashFreeze: boolean, path: Enemy[]): void {
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
  let used = 0
  for (const { enemy } of behind) {
    if (used >= count) break
    path.push(enemy)
    if (!(flashFreeze && isHeld(enemy))) used++
  }
}

/** Beam Fork: plain beams off its target to the `count` nearest other enemies within `beam.forkRange`. */
function forkFrom(world: World, target: Enemy, count: number, state: BeamState): void {
  if (count <= 0) return
  const near = enemiesInRadius(world, target.x, target.y, config.beam.forkRange, scratch)
    .filter((enemy) => enemy.hp > 0 && !state.path.includes(enemy))
    .sort((a, b) => (a.x - target.x) ** 2 + (a.y - target.y) ** 2 - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2))
  for (let i = 0; i < Math.min(count, near.length); i++) state.forks.push(near[i])
}

/**
 * Frostbite: cold builds on everything touched, a second's worth a second.
 * Once the beam leaves an enemy, whatever cold it has drains away over
 * beam.chillFadeSeconds (spellbook: "chill fades over 2 seconds"). The
 * chill follows the cold; at beam.freezeSeconds a touched enemy freezes, and
 * stays frozen while touched and beam.frozenLinger after.
 */
function frostbite(world: World, weapon: WeaponInstance, state: BeamState, active: boolean, dt: number): void {
  const { freezeSeconds, chillFadeSeconds, maxChill, frozenLinger } = config.beam
  if (active) {
    for (const enemy of state.path) {
      const entry = state.cold.get(enemy.id) ?? { enemy, seconds: 0 }
      entry.seconds = Math.min(freezeSeconds, entry.seconds + dt)
      entry.fade = undefined
      state.cold.set(enemy.id, entry)
    }
  }
  for (const [id, entry] of state.cold) {
    const touched = active && state.path.includes(entry.enemy)
    if (!touched) {
      entry.fade ??= entry.seconds / chillFadeSeconds
      entry.seconds -= dt * entry.fade
    }
    if (entry.enemy.hp <= 0 || entry.seconds <= 0) {
      setCondition(world, entry.enemy, 'chilled', 0, 0, weapon)
      state.cold.delete(id)
      continue
    }
    setCondition(world, entry.enemy, 'chilled', maxChill * Math.min(1, entry.seconds / freezeSeconds), 0.3, weapon)
    if (touched && entry.seconds >= freezeSeconds) applyCondition(world, entry.enemy, 'frozen', 1, frozenLinger + 0.15, weapon)
  }
}

/** Winter's Breath: everything touched and not frozen, pushed straight away from him. */
function push(from: { x: number; y: number }, touched: Enemy[], distance: number): void {
  if (distance <= 0) return
  for (const enemy of touched) {
    if (isHeld(enemy)) continue
    const dx = enemy.x - from.x
    const dy = enemy.y - from.y
    const length = Math.hypot(dx, dy) || 1
    enemy.x += (dx / length) * distance
    enemy.y += (dy / length) * distance
  }
}

/** Cold Snap: every `interval` seconds of beam, everything it touches freezes on the spot, in a white flash. */
function coldSnap(world: World, weapon: WeaponInstance, state: BeamState, interval: number, elapsed: number): void {
  if (interval <= 0) return
  state.snapTimer = (state.snapTimer ?? interval) - elapsed
  if (state.snapTimer > 0) return
  state.snapTimer += interval
  state.flashUntil = world.time + config.beam.snapFlash
  for (const enemy of state.path) applyCondition(world, enemy, 'frozen', 1, config.beam.frozenLinger, weapon)
}
