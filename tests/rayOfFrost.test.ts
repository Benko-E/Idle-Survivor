// The new build's Ray of Frost (spellbook, Version 12): the beam, its generic
// beam upgrades and its mutations, through the real simulation.
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { updateCombat } from '@game/sim/combat'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
