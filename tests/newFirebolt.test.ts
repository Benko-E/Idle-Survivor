// The new build's Firebolt (spellbook, Version 12): its generic bolt upgrades
// and its mutations, through the real simulation.
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { updateCombat } from '@game/sim/combat'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const FIREBOLT = 'spell_firebolt_01'
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
/** A run with the new Firebolt; he stands at the origin and nothing moves him. */
const fireWorld = () => createWorld(1, FIREBOLT)
/** One cast right now, then no more casting. */
function cast(world: World): void {
  world.weapons[0].cooldownRemaining = 0
  rebuildEnemyGrid(world)
  updateCombat(world, DT)
  world.weapons[0].cooldownRemaining = 99
}
/** Let everything fly for a while. */
function fly(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    rebuildEnemyGrid(world)
    updateCombat(world, DT)
  }
}

// --- The spell and its generic bolt upgrades ----------------------------------

{
  const w = fireWorld()
  const oldRun = createWorld(1, 'spell_bolt_01')
  check('Pierce, Fork, Return offered with the new Firebolt', ['pierce', 'fork', 'return'].every((k) => eligible(w, `up_firebolt_${k}`)))
  check('...never with the old one', ['pierce', 'fork', 'return'].every((k) => !eligible(oldRun, `up_firebolt_${k}`)))
  check("...and the old Firebolt's never with the new one", !eligible(w, 'up_fb_ignite') && !eligible(w, 'up_fb_pierce'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce', 2)
  const line = [90, 120, 150, 180].map((x) => enemy(w, x, 0))
  cast(w)
  fly(w, 1)
  const hit = line.filter((e) => lost(e) > 0).length
  check('Pierce x2: through two, stopped by the third', hit === 3, `${hit} of 4 hit`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_fork')
  enemy(w, 90, 0)
  enemy(w, 130, 60)
  cast(w)
  let forks: typeof w.projectiles = []
  for (let i = 0; i < 60 && forks.length === 0; i++) {
    fly(w, DT)
    forks = w.projectiles.filter((p) => !p.mutations)
  }
  check('Fork: a hit throws one plain bolt', forks.length === 1 && forks[0].pierce === 0, `${forks.length} plain bolt(s)`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_return')
  enemy(w, 150, 0)
  cast(w)
  let turned = false
  for (let i = 0; i < 150; i++) {
    fly(w, DT)
    if (w.projectiles.some((p) => p.returning)) turned = true
  }
  check('Return: it comes back to him', turned && w.projectiles.length === 0)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
