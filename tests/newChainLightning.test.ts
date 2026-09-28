// The new build's Chain Lightning (spellbook, Version 12): the chain, its
// generic chain upgrades and its mutations, through the real simulation.
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { updateCombat } from '@game/sim/combat'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { spellsOfTier } from '@game/sim/spellTiers'
import { weaponStat } from '@game/sim/stats'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const CHAIN = 'spell_chain_lightning_01'
const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}
const near = (a: number, b: number, slack = 1e-6) => Math.abs(a - b) <= slack
let nextId = 1
function enemy(world: World, x: number, y: number, hp = 1e9): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  world.enemies.push(e)
  return e
}
const lost = (e: Enemy) => e.maxHp - e.hp
const chainWorld = () => createWorld(1, CHAIN)
/** One cast right now, then no more casting. */
function cast(world: World): void {
  world.weapons[0].cooldownRemaining = 0
  rebuildEnemyGrid(world)
  updateCombat(world, DT)
  world.weapons[0].cooldownRemaining = 99
}
const base = (world: World) => weaponStat(world, world.weapons[0], 'damage')
/** Enemies 100 apart in a line out from him. */
const line = (world: World, n: number) => Array.from({ length: n }, (_, k) => enemy(world, 100 * (k + 1), 0))

// --- The chain ---------------------------------------------------------------------

{
  const ids = spellsOfTier(DEFAULT_CLASS, 1).map((def) => def.id)
  check('The new build offers all three new starters', ['spell_firebolt_01', 'spell_ray_of_frost_01', CHAIN].every((id) => ids.includes(id)), ids.join(', '))
}
{
  const w = chainWorld()
  const five = line(w, 5)
  cast(w)
  const falloff = weaponStat(w, w.weapons[0], 'falloff')
  const expected = [0, 1, 2, 3].map((k) => base(w) * falloff ** k)
  check('It strikes the nearest, then jumps to 3 more', five.slice(0, 4).every((e, k) => near(lost(e), expected[k], 1e-6)) && lost(five[4]) === 0, five.map((e) => lost(e).toFixed(2)).join(' / '))
}
{
  const w = chainWorld()
  const [a, b] = line(w, 2)
  cast(w)
  check('...never the same enemy twice', near(lost(a), base(w)) && lost(b) > 0 && lost(b) < base(w))
}
{
  const w = chainWorld()
  const out = enemy(w, 700, 0)
  cast(w)
  check('...nothing in range: nothing happens', lost(out) === 0)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
