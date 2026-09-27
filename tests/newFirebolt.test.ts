// The new build's Firebolt (spellbook, Version 12): its generic bolt upgrades
// and its mutations, through the real simulation.
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { updateCombat } from '@game/sim/combat'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { createWorld, type Enemy, type World } from '@game/sim/world'
import { config } from '@game/config'
import { weaponStat } from '@game/sim/stats'
import { applyCondition, hasCondition } from '@game/sim/statusEffects'

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
const near = (a: number, b: number, slack = 1e-6) => Math.abs(a - b) <= slack
const damageOf = (world: World) => weaponStat(world, world.weapons[0], 'damage')

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

// --- Ignite ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce')
  take(w, 'up_firebolt_ignite')
  const a = enemy(w, 90, 0)
  const b = enemy(w, 120, 0)
  cast(w)
  fly(w, 1)
  check('Ignite: sets what it hits burning, pierced ones too', hasCondition(a, 'burning') && hasCondition(b, 'burning'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_fork')
  take(w, 'up_firebolt_ignite')
  enemy(w, 90, 0)
  const side = enemy(w, 130, 60)
  cast(w)
  fly(w, 1)
  check("...but its plain fork doesn't", lost(side) > 0 && !hasCondition(side, 'burning'), `fork dealt ${lost(side).toFixed(1)}`)
}

// --- Kindling ----------------------------------------------------------------

{
  const w = fireWorld()
  check('Kindling needs Ignite first', !eligible(w, 'up_firebolt_kindling'))
  take(w, 'up_firebolt_ignite')
  check('...offered once Ignite is in', eligible(w, 'up_firebolt_kindling'))
  take(w, 'up_firebolt_kindling')
  const nearBurning = enemy(w, 80, 0)
  const far = enemy(w, 0, 160)
  applyCondition(w, nearBurning, 'burning', 1, 5, null)
  cast(w)
  check('...aims past a burning enemy at an unburnt one', w.projectiles[0]?.targetId === far.id)
  cast(w)
  check('...all burning or taken: the nearest as usual', w.projectiles[1]?.targetId === nearBurning.id)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_ignite')
  take(w, 'up_firebolt_kindling')
  const a = enemy(w, 100, 0)
  const b = enemy(w, 0, 130)
  cast(w)
  cast(w)
  const targets = w.projectiles.map((p) => p.targetId)
  check('...two casts in a row spread to two enemies', targets.includes(a.id) && targets.includes(b.id), JSON.stringify(targets))
}

// --- Split Shot ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_split', 2)
  take(w, 'up_firebolt_fork')
  take(w, 'up_firebolt_return')
  take(w, 'up_firebolt_ignite')
  enemy(w, 100, 0)
  enemy(w, 100, 60)
  enemy(w, 100, -60)
  cast(w)
  const bolts = w.projectiles
  check('Split Shot x2: three bolts', bolts.length === 3, `${bolts.length}`)
  check('...sharing the damage, a third each', bolts.every((b) => near(b.damage, damageOf(w) / 3)))
  check('...each at its own enemy', new Set(bolts.map((b) => b.targetId)).size === 3)
  check('...every one carries Ignite', bolts.every((b) => (b.mutations?.ignite ?? 0) > 0))
  check('...only the main bolt forks and returns', bolts.filter((b) => (b.mutations?.fork ?? 0) > 0 || (b.mutations?.returns ?? 0) > 0).length === 1)
  check('...and it stops at three bolts', !eligible(w, 'up_firebolt_split'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_split', 2)
  enemy(w, 100, 0)
  cast(w)
  const angles = new Set(w.projectiles.map((b) => Math.atan2(b.vy, b.vx).toFixed(3)))
  check('...one enemy: the extras fan out either side', angles.size === 3)
}

// --- Hot Streak ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_hotstreak')
  enemy(w, 400, 0)
  const casts: { damage: number; radius: number; white: boolean }[] = []
  for (let n = 0; n < 5; n++) {
    w.projectiles.length = 0
    cast(w)
    const b = w.projectiles[0]
    casts.push({ damage: b.damage, radius: b.radius, white: b.whiteHot === true })
  }
  check('Hot Streak: the 5th cast is white-hot', casts.map((c) => c.white).join() === 'false,false,false,false,true')
  check('...at twice the damage', near(casts[4].damage, casts[0].damage * config.combat.whiteHotDamage))
  check('...and the same size', casts[4].radius === casts[0].radius)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_hotstreak')
  take(w, 'up_firebolt_split', 2)
  enemy(w, 400, 0)
  for (let n = 0; n < 5; n++) {
    w.projectiles.length = 0
    cast(w)
  }
  check('...every bolt of that cast, Split Shot too', w.projectiles.length === 3 && w.projectiles.every((b) => b.whiteHot === true))
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
