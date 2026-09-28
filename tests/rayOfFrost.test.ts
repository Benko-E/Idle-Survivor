// The new build's Ray of Frost (spellbook, Version 12): the beam, its generic
// beam upgrades and its mutations, through the real simulation.
import { config } from '@game/config'
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { updateCombat } from '@game/sim/combat'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { gameEvents } from '@game/sim/events'
import { spellsOfTier } from '@game/sim/spellTiers'
import { weaponStat } from '@game/sim/stats'
import { applyCondition, isHeld, slowMultiplier } from '@game/sim/statusEffects'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const RAY = 'spell_ray_of_frost_01'
const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}
const up = (id: string) => {
  const def = UPGRADE_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No upgrade "${id}"`)
  return def
}
const take = (world: World, id: string, times = 1) => {
  for (let i = 0; i < times; i++) applyUpgrade(world, up(id))
}
const eligible = (world: World, id: string) => upgradeIsEligible(world, up(id))
let nextId = 1
function enemy(world: World, x: number, y: number, hp = 1e9): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  world.enemies.push(e)
  return e
}
const lost = (e: Enemy) => e.maxHp - e.hp
/** A run with the Ray, ready to cast; he stands at the origin and nothing moves him. */
function frostWorld(): World {
  const w = createWorld(1, RAY)
  w.weapons[0].cooldownRemaining = 0
  return w
}
/** Let the world run for a while: the beam ticks, conditions run. */
function fly(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    rebuildEnemyGrid(world)
    updateCombat(world, DT)
  }
}
const dps = (world: World) => weaponStat(world, world.weapons[0], 'damage')

// --- The beam ----------------------------------------------------------------------

check('The new build offers the Ray at the start', spellsOfTier(DEFAULT_CLASS, 1).some((def) => def.id === RAY))
{
  const w = frostWorld()
  const close = enemy(w, 80, 0)
  const far = enemy(w, 150, 0)
  fly(w, 1)
  check('It holds the nearest enemy', lost(close) > 0 && lost(far) === 0, `${lost(close).toFixed(1)} / ${lost(far).toFixed(1)}`)
  check('...for its damage every second', Math.abs(lost(close) - dps(w)) <= dps(w) * 0.05, `${lost(close).toFixed(1)} in 1s, ${dps(w)} a second`)
  check('...and nothing else: no chill of its own', slowMultiplier(close) === 1)
  close.hp = 0
  fly(w, 0.2)
  check('Its enemy dies: it snaps to the next nearest', lost(far) > 0)
}
{
  const w = frostWorld()
  const out = enemy(w, 600, 0)
  fly(w, 1)
  check('Nothing in range: it idles', lost(out) === 0 && (w.weapons[0].beam?.path.length ?? 0) === 0)
}
{
  const w = frostWorld()
  const walker = enemy(w, 100, 0)
  fly(w, 0.3)
  walker.x = 900
  const before = lost(walker)
  fly(w, 0.3)
  check('Its enemy leaves its range: it lets go', lost(walker) === before && (w.weapons[0].beam?.path.length ?? 0) === 0)
}

// --- Beam Pierce and Beam Fork -------------------------------------------------------

{
  const w = frostWorld()
  check('Beam Pierce and Fork offered with the Ray', eligible(w, 'up_ray_pierce') && eligible(w, 'up_ray_fork'))
  check("...never the bolt list's", !['up_firebolt_return', 'up_firebolt_heavy', 'up_firebolt_split'].some((id) => eligible(w, id)))
  take(w, 'up_ray_pierce')
  const target = enemy(w, 80, 0)
  const behind = enemy(w, 130, 0)
  const aside = enemy(w, 130, 60)
  fly(w, 1)
  check('Pierce: the enemy behind its target is touched too', lost(target) > 0 && lost(behind) > 0 && lost(aside) === 0, `${lost(behind).toFixed(1)} behind, ${lost(aside).toFixed(1)} aside`)
}
{
  const w = frostWorld()
  take(w, 'up_ray_fork')
  const target = enemy(w, 80, 0)
  const side = enemy(w, 100, 70)
  fly(w, 1)
  const share = lost(side) / lost(target)
  check('Fork: a second beam off its target, at half the damage', Math.abs(share - 0.5) < 0.08, `${lost(side).toFixed(1)} vs ${lost(target).toFixed(1)}`)
}

// --- Frostbite ----------------------------------------------------------------------

const chillOf = (e: Enemy) => 1 - slowMultiplier(e)
{
  const w = frostWorld()
  take(w, 'up_ray_frostbite')
  const e = enemy(w, 100, 0)
  fly(w, 1.5)
  check('Frostbite: the held enemy gets colder', Math.abs(chillOf(e) - 0.35) < 0.06, `slow ${chillOf(e).toFixed(2)} at 1.5s`)
  fly(w, 1.6)
  check('...frozen at 3 seconds', isHeld(e))
  fly(w, 1.9)
  check('...and stays frozen while held', isHeld(e))
  e.x = 900
  fly(w, 1.5)
  check('...still frozen 1.5s after the beam leaves', isHeld(e))
  fly(w, 0.8)
  check('...thawed by 2.3s', !isHeld(e))
}
{
  const w = frostWorld()
  take(w, 'up_ray_frostbite')
  const e = enemy(w, 100, 0)
  fly(w, 1.5)
  e.x = 900
  fly(w, 1)
  const halfway = chillOf(e)
  fly(w, 1.2)
  check('...its chill fades over about 2s once it leaves', halfway > 0 && halfway < 0.3 && chillOf(e) === 0, `${halfway.toFixed(2)} after 1s, ${chillOf(e).toFixed(2)} after 2.2s`)
}

// --- Flash Freeze -----------------------------------------------------------------

{
  const w = frostWorld()
  check('Flash Freeze needs Frostbite first', !eligible(w, 'up_ray_flashfreeze'))
  take(w, 'up_ray_frostbite')
  check('...offered once it is in', eligible(w, 'up_ray_flashfreeze'))
  take(w, 'up_ray_flashfreeze')
  const first = enemy(w, 80, 0)
  const second = enemy(w, 0, 130)
  fly(w, 3.3)
  check('...once its target freezes, the beam moves on', isHeld(first) && w.weapons[0].beam?.target === second)
}
{
  const w = frostWorld()
  take(w, 'up_ray_frostbite')
  take(w, 'up_ray_flashfreeze')
  const a = enemy(w, 80, 0)
  const b = enemy(w, 0, 130)
  applyCondition(w, a, 'frozen', 1, 10, null)
  applyCondition(w, b, 'frozen', 1, 10, null)
  fly(w, 0.2)
  const held = w.weapons[0].beam?.target
  let steady = held !== undefined
  for (let i = 0; i < 10; i++) {
    fly(w, 0.1)
    if (w.weapons[0].beam?.target !== held) steady = false
  }
  check('...everything frozen: it stays put, no flicker', steady)
}

// --- Winter's Breath --------------------------------------------------------------

{
  const w = frostWorld()
  take(w, 'up_ray_wintersbreath')
  const e = enemy(w, 100, 0)
  fly(w, 1)
  check("Winter's Breath: pushed away about 20 a second", Math.abs(e.x - 120) < 3, `x ${e.x.toFixed(1)}`)
}
{
  const w = frostWorld()
  take(w, 'up_ray_frostbite')
  take(w, 'up_ray_wintersbreath')
  const e = enemy(w, 100, 0)
  fly(w, 3.2)
  const x = e.x
  fly(w, 1)
  check('...and stops pushing once frozen', isHeld(e) && Math.abs(e.x - x) < 0.01, `moved ${(e.x - x).toFixed(2)} while frozen`)
}

// --- Cold Snap ----------------------------------------------------------------------

{
  const w = frostWorld()
  take(w, 'up_ray_coldsnap')
  const e = enemy(w, 100, 0)
  fly(w, 5.8)
  check('Cold Snap: nothing before its time', !isHeld(e))
  fly(w, 0.4)
  check('...then it freezes its target, no Frostbite needed', isHeld(e) && (w.weapons[0].beam?.flashUntil ?? 0) > 0)
}

// --- Cold Shoulder ------------------------------------------------------------------

{
  const w = frostWorld()
  take(w, 'up_ray_coldshoulder')
  const touching = w.character.radius + ENEMY_DEFS[0].radius * 0.5
  const a = enemy(w, touching, 0)
  const b = enemy(w, -touching, 0)
  const far = enemy(w, 200, 0)
  w.lastHurtAt = w.time
  fly(w, DT)
  check('Cold Shoulder: hit, and the enemies touching him freeze', isHeld(a) && isHeld(b) && !isHeld(far))
  fly(w, 1.7)
  check('...for about 1.5s', !isHeld(a))
  const fresh = enemy(w, 0, touching)
  w.lastHurtAt = w.time
  fly(w, DT)
  check('...then not again for a while', !isHeld(fresh))
  fly(w, 10)
  w.lastHurtAt = w.time
  fly(w, DT)
  check('...until its wait is over', isHeld(fresh))
}

// --- Playtest: Pierce kept flickering between enemies ----------------------------------

{
  const w = frostWorld()
  take(w, 'up_ray_pierce', 3)
  enemy(w, 80, 0)
  for (const x of [110, 140, 170]) enemy(w, x, 0)
  // Two more that bob just in and out of the strip Pierce picks from, as a
  // jostling crowd does, but never far from the line.
  const pickEdge = config.beam.width + ENEMY_DEFS[0].radius
  const bobbers = [enemy(w, 125, 0), enemy(w, 155, 0)]
  let changes = 0
  let last = ''
  for (let i = 0; i < 10; i++) {
    for (const b of bobbers) b.y = i % 2 === 0 ? 0 : pickEdge + 3
    fly(w, 0.1)
    const now = (w.weapons[0].beam?.path ?? []).map((e) => e.id).sort().join(',')
    if (last && now !== last) changes++
    last = now
  }
  check('Pierce keeps its enemies while the crowd jostles', changes <= 1, `${changes} changes in 1s`)
}

// --- Glacial Sweep ------------------------------------------------------------------

/** An enemy at `degrees` round him, `distance` away. */
const at = (world: World, degrees: number, distance: number) => enemy(world, Math.cos((degrees * Math.PI) / 180) * distance, Math.sin((degrees * Math.PI) / 180) * distance)
{
  const w = frostWorld()
  w.level = 20
  check('Glacial Sweep is an evolution, offered at 20', up('up_ray_sweep').kind === 'evolution' && eligible(w, 'up_ray_sweep'))
  take(w, 'up_ray_sweep')
  check('...and rules out Winding Ray', !eligible(w, 'up_ray_winding'))
  const left = at(w, -30, 150)
  const middle = at(w, 0, 140)
  const right = at(w, 30, 150)
  const outside = at(w, 90, 150)
  fly(w, 2.5)
  check('...it sweeps across the crowd in front of him', lost(left) > 0 && lost(middle) > 0 && lost(right) > 0, [left, middle, right].map((e) => lost(e).toFixed(1)).join(' / '))
  check('...an arc, not a circle', lost(outside) === 0)
}
{
  const w = frostWorld()
  w.level = 20
  take(w, 'up_ray_sweep')
  const front = at(w, 0, 100)
  const back = at(w, 0, 170)
  fly(w, 2.5)
  check('...no Pierce: it grazes the front row only', lost(front) > 0 && lost(back) === 0)
}
{
  const w = frostWorld()
  w.level = 20
  take(w, 'up_ray_frostbite')
  take(w, 'up_ray_flashfreeze')
  take(w, 'up_ray_sweep')
  const front = at(w, 0, 100)
  applyCondition(w, front, 'frozen', 1, 30, null)
  const back = at(w, 0, 170)
  fly(w, 2.5)
  check('...with Flash Freeze, frozen enemies don\'t block it', lost(back) > 0)
}
{
  const w = frostWorld()
  w.level = 20
  take(w, 'up_ray_frostbite')
  take(w, 'up_ray_sweep')
  const e = at(w, 0, 120)
  let frozenAt = -1
  for (let i = 0; i < 60 && frozenAt < 0; i++) {
    fly(w, 0.1)
    if (isHeld(e)) frozenAt = (i + 1) * 0.1
  }
  check('...Frostbite builds a step each pass, freezing in a few passes', frozenAt > 1.5 && frozenAt < 6, `frozen at ${frozenAt.toFixed(1)}s`)
}
{
  const w = frostWorld()
  w.level = 20
  take(w, 'up_ray_sweep')
  const out = at(w, 0, 600)
  fly(w, 1)
  check('...nothing in range: it rests', lost(out) === 0 && (w.weapons[0].beam?.path.length ?? 0) === 0 && w.weapons[0].beam?.sweepAngle === undefined)
}

// --- Winding Ray --------------------------------------------------------------------

/** Three enemies in front, near the line, and a pack of six further out. */
function crowd(world: World): { front: Enemy[]; pack: Enemy[] } {
  const front = [enemy(world, 60, 12), enemy(world, 110, -12), enemy(world, 160, 12)]
  const pack = [0, 1, 2, 3, 4, 5].map((k) => enemy(world, 260 + Math.cos(k) * 25, Math.sin(k) * 25))
  return { front, pack }
}
const windingWorld = (...ids: string[]) => {
  const w = frostWorld()
  w.level = 20
  for (const id of ['up_ray_winding', ...ids]) take(w, id)
  return w
}
{
  const w = frostWorld()
  w.level = 20
  check('Winding Ray is an evolution, offered at 20', up('up_ray_winding').kind === 'evolution' && eligible(w, 'up_ray_winding'))
  take(w, 'up_ray_winding')
  check('...and rules out Glacial Sweep', !eligible(w, 'up_ray_sweep'))
  const { front, pack } = crowd(w)
  fly(w, 1)
  const deep = pack.filter((e) => lost(e) > 0).length
  check('...it winds through the front three into the pack', front.every((e) => lost(e) > 0) && deep === 1, `${front.filter((e) => lost(e) > 0).length} front, ${deep} of the pack`)
}
{
  const w = windingWorld('up_ray_pierce')
  const { pack } = crowd(w)
  fly(w, 1)
  check('...each Pierce reaches one deeper', pack.filter((e) => lost(e) > 0).length === 2)
}
{
  const w = windingWorld('up_ray_frostbite', 'up_ray_flashfreeze')
  const { front, pack } = crowd(w)
  applyCondition(w, front[1], 'frozen', 1, 30, null)
  fly(w, 1)
  check("...frozen enemies don't use up a pass-through", pack.filter((e) => lost(e) > 0).length === 2)
}
{
  const w = windingWorld()
  const lone = enemy(w, 120, 30)
  fly(w, 1)
  check('...a thin crowd: a straight beam at the nearest', lost(lone) > 0 && w.weapons[0].beam?.path.length === 1)
}
{
  const w = windingWorld()
  const { front } = crowd(w)
  fly(w, 0.2)
  // Bob one front enemy just in and out of the corridor it winds through
  // (towards the pack it chose), as a jostling crowd does.
  const aim = w.weapons[0].beam!.windingAim!
  const length = Math.hypot(aim.x, aim.y)
  const [ux, uy] = [aim.x / length, aim.y / length]
  const edge = config.beam.windingCorridor / 2
  const bob = (off: number) => {
    front[1].x = ux * 110 - uy * off
    front[1].y = uy * 110 + ux * off
  }
  bob(edge - 5)
  fly(w, 0.2)
  let changes = 0
  let last = (w.weapons[0].beam?.path ?? []).map((e) => e.id).sort().join(',')
  for (let i = 0; i < 10; i++) {
    bob(i % 2 === 0 ? edge + 5 : edge - 5)
    fly(w, 0.1)
    const now = (w.weapons[0].beam?.path ?? []).map((e) => e.id).sort().join(',')
    if (last && now !== last) changes++
    last = now
  }
  check('...its pass-throughs hold steady while the crowd jostles', changes === 0, `${changes} changes in 1s`)
}

// --- Found in review -----------------------------------------------------------------

{
  // Spellbook: frozen means frozen while touched, then 2 seconds.
  const w = frostWorld()
  take(w, 'up_ray_coldsnap')
  const e = enemy(w, 100, 0)
  fly(w, 6.2)
  check('Cold Snap: frozen...', isHeld(e))
  fly(w, 3)
  check('...and still frozen while the beam holds it', isHeld(e))
}
{
  const w = frostWorld()
  take(w, 'up_ray_frostbite')
  const e = enemy(w, 100, 0)
  fly(w, 3.2)
  e.x = 900
  fly(w, 1)
  e.x = 100
  fly(w, 0.3)
  check('Frozen, away for a second, back under the beam: still frozen', isHeld(e))
  fly(w, 1.5)
  check('...and it stays frozen', isHeld(e))
}
{
  // A tick of beam is continuous damage, not a hit: hits make the enemy
  // flash white, and ten a second is a strobe.
  const w = frostWorld()
  const e = enemy(w, 100, 0)
  let hits = 0
  let ticks = 0
  const stop = gameEvents.on('enemyDamaged', (payload) => {
    if (payload.enemyId !== e.id) return
    if (payload.overTime) ticks++
    else hits++
  })
  fly(w, 1)
  stop()
  check('Beam damage is continuous, not a strobe of hits', hits === 0 && ticks > 0, `${hits} hits, ${ticks} ticks`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
