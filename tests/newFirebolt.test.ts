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

// --- Heavy or Accelerating ------------------------------------------------------------

{
  const w = fireWorld()
  check('Heavy and Accelerating are an either-or pair', up('up_firebolt_heavy').pairedWith === 'up_firebolt_accelerating')
  take(w, 'up_firebolt_heavy')
  const s = w.weapons[0]
  check('Heavy: 40% slower, 50% bigger, 1.6x damage', near(weaponStat(w, s, 'boltSpeed', 1), 0.6) && near(weaponStat(w, s, 'boltSize', 1), 1.5) && near(weaponStat(w, s, 'boltDamage', 1), 1.6))
  check('...and rules out Accelerating', !eligible(w, 'up_firebolt_accelerating'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_accelerating')
  enemy(w, 515, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const base = weaponStat(w, w.weapons[0], 'speed')
  const start = Math.hypot(bolt.vx, bolt.vy)
  fly(w, (bolt.outLife ?? 1) * 0.85)
  const late = Math.hypot(bolt.vx, bolt.vy)
  // Measured after the cast's own step, so it has already sped up a touch.
  check('Accelerating: starts at half speed', near(start, base * 0.5, base * 0.05), `${start.toFixed(0)} of ${base}`)
  check('...and is nearly twice as fast late on', late > base * 1.6, `${late.toFixed(0)}`)
}
{
  const hitAt = (x: number) => {
    const w = fireWorld()
    take(w, 'up_firebolt_accelerating')
    const e = enemy(w, x, 0)
    cast(w)
    fly(w, 3)
    return lost(e)
  }
  const close = hitAt(40)
  const far = hitAt(480)
  check('...and hits harder the faster it goes', far > close * 1.8, `close ${close.toFixed(1)}, far ${far.toFixed(1)}`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_accelerating')
  take(w, 'up_firebolt_return')
  enemy(w, 500, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const base = weaponStat(w, w.weapons[0], 'speed')
  let fastest = 0
  for (let i = 0; i < 400 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    fastest = Math.max(fastest, Math.hypot(bolt.vx, bolt.vy))
  }
  check('With Return: faster still, never past 3x', fastest > base * 2 && fastest <= base * config.combat.accelerateMax + 1e-6, `${(fastest / base).toFixed(2)}x`)
}

// --- Stoked ------------------------------------------------------------------------

{
  const w = fireWorld()
  check('Stoked needs Pierce first', !eligible(w, 'up_firebolt_stoked'))
  take(w, 'up_firebolt_pierce', 3)
  check('...offered once Pierce is in', eligible(w, 'up_firebolt_stoked'))
  take(w, 'up_firebolt_stoked')
  const line = [80, 110, 140, 170].map((x) => enemy(w, x, 0))
  cast(w)
  fly(w, 1)
  const expected = [1, 1.15, 1.3, 1.45].map((k) => damageOf(w) * k)
  check('Stoked: +15% for each enemy burned through', line.every((e, i) => near(lost(e), expected[i], 0.01)), line.map((e) => lost(e).toFixed(2)).join(', '))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce', 3)
  take(w, 'up_firebolt_stoked')
  take(w, 'up_firebolt_return')
  for (let k = 0; k < 12; k++) enemy(w, 60 + k * 25, 0)
  cast(w)
  const bolt = w.projectiles[0]
  let hottest = 0
  for (let i = 0; i < 200 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    hottest = Math.max(hottest, bolt.damage)
  }
  check('...never past +120%, even back through a crowd', near(hottest, damageOf(w) * (1 + config.combat.stokedMax), 0.01), `${(hottest / damageOf(w)).toFixed(2)}x`)
}

// --- Backdraft ---------------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_backdraft')
  w.weapons[0].cooldownRemaining = 99
  w.lastHurtAt = w.time
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  check('Backdraft: hurt, and 8 plain bolts burst out', w.projectiles.length === 8 && w.projectiles.every((p) => !p.mutations), `${w.projectiles.length}`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
