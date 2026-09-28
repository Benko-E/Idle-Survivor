// The new build's Firebolt (spellbook, Version 12): its generic bolt upgrades
// and its mutations, through the real simulation.
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { updateCombat } from '@game/sim/combat'
import { applyUpgrade, currentOffers, upgradeIsEligible } from '@game/sim/draft'
import { grantXp, xpForLevel } from '@game/sim/progression'
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

// --- Forks stay plain (spellbook: spawns get none of the mutations or bolt upgrades) ---

/** The damage of the first plain bolt a fork throws, with these upgrades and `casts` casts. */
function forkDamage(ids: string[], casts = 1): number {
  const w = fireWorld()
  for (const id of ids) take(w, id)
  enemy(w, 90, 0)
  enemy(w, 130, 60)
  for (let n = 0; n < casts; n++) {
    w.projectiles.length = 0
    cast(w)
  }
  for (let i = 0; i < 60; i++) {
    fly(w, DT)
    const fork = w.projectiles.find((p) => !p.mutations)
    if (fork) return fork.damage
  }
  return NaN
}
{
  const base = damageOf(fireWorld()) * config.combat.forkDamage
  const white = forkDamage(['up_firebolt_fork', 'up_firebolt_hotstreak'], 5)
  const heavy = forkDamage(['up_firebolt_fork', 'up_firebolt_heavy'])
  check('A fork off a white-hot bolt: still half the plain hit', near(white, base), `${white} vs ${base}`)
  check('...and off a Heavy bolt too', near(heavy, base), `${heavy} vs ${base}`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_fork')
  take(w, 'up_firebolt_return')
  enemy(w, 150, 0)
  // Near the way out and the way back, so a second fork would find a target.
  enemy(w, 110, 50)
  enemy(w, 60, 40)
  cast(w)
  let forks = 0
  const seen = new Set<object>()
  for (let i = 0; i < 150; i++) {
    fly(w, DT)
    for (const p of w.projectiles) {
      if (p.mutations || seen.has(p)) continue
      seen.add(p)
      forks++
    }
  }
  check('Only the first hit forks, not again on the way back', forks === 1, `${forks} fork(s)`)
}

// --- Running dry before level 20 --------------------------------------------------

{
  const w = fireWorld()
  // Every ordinary upgrade there is for the new Firebolt.
  for (const def of UPGRADE_DEFS) {
    if (def.spellId !== FIREBOLT || def.kind === 'evolution' || def.id === 'up_firebolt_accelerating') continue
    for (let i = 0; i < def.maxStacks; i++) applyUpgrade(w, def)
  }
  while (w.level < 20) grantXp(w, xpForLevel(w.level))
  const offered = currentOffers(w).map((offer) => offer.id)
  check('Ran dry: levels with nothing to pick are not saved up', w.pendingLevelUps === 1, `${w.pendingLevelUps} waiting`)
  check('...so level 20 still deals the evolutions', offered.includes('up_firebolt_pinwheel') && offered.includes('up_firebolt_salvo'), offered.join(', '))
}

// --- Pinwheel ---------------------------------------------------------------------

{
  const w = fireWorld()
  w.level = 20
  check('Pinwheel is an evolution, offered at 20', up('up_firebolt_pinwheel').kind === 'evolution' && eligible(w, 'up_firebolt_pinwheel'))
  take(w, 'up_firebolt_pinwheel')
  check('...and rules out Salvo', !eligible(w, 'up_firebolt_salvo'))
  const target = enemy(w, 100, 0)
  // Round the far side of the target, where the spiral passes but the bolt's
  // straight flight in doesn't.
  const ring = [-1.5, -0.75, 0, 0.75, 1.5].map((a) => enemy(w, 100 + Math.cos(a) * 30, Math.sin(a) * 30))
  cast(w)
  const bolt = w.projectiles[0]
  let spiralled = false
  let spreadOut = 0
  for (let i = 0; i < 120 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    if (bolt.spiral) {
      spiralled = true
      spreadOut = Math.max(spreadOut, Math.hypot(bolt.x - bolt.spiral.x, bolt.y - bolt.spiral.y))
    }
  }
  const hits = [target, ...ring].filter((e) => lost(e) > 0).length
  check('...the first hit is free and starts a spiral', spiralled && lost(target) > 0)
  check('...no Pierce: one more enemy, then gone', hits === 2 && !w.projectiles.includes(bolt), `${hits} hit`)
  check('...and the spiral opens outward', spreadOut > config.combat.pinwheelStart, spreadOut.toFixed(1))
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_pinwheel')
  enemy(w, 500, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const life = bolt.life
  let spiralAt = -1
  let steps = 0
  for (; steps < 400 && w.projectiles.includes(bolt); steps++) {
    fly(w, DT)
    if (bolt.spiral && spiralAt < 0) spiralAt = steps * DT
  }
  check('Pinwheel missing everything: spirals where the straight part ends', near(spiralAt, life * config.combat.pinwheelStraight, 0.05), `${spiralAt.toFixed(2)}s of ${life.toFixed(2)}s`)
  check('...and still ends on time', near(steps * DT, life, 0.05), `${(steps * DT).toFixed(2)}s`)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_pinwheel')
  take(w, 'up_firebolt_return')
  enemy(w, 100, 0)
  enemy(w, 130, 0)
  cast(w)
  const bolt = w.projectiles[0]
  let home = false
  let spiralWhileReturning = false
  for (let i = 0; i < 300; i++) {
    fly(w, DT)
    if (bolt.returning && bolt.spiral) spiralWhileReturning = true
    if (!w.projectiles.includes(bolt)) {
      home = true
      break
    }
  }
  check('Pinwheel + Return: flies straight home after the spiral', home && !spiralWhileReturning)
}

// --- Salvo --------------------------------------------------------------------------

{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  const pack = [0, 1, 2, 3, 4].map((k) => enemy(w, 120, -80 + k * 40))
  for (let n = 0; n < 4; n++) cast(w)
  check('Salvo: casts gather over his head, none fly yet', w.projectiles.length === 0 && w.weapons[0].salvo?.bolts.length === 4, `${w.weapons[0].salvo?.bolts.length} gathered`)
  cast(w)
  const targets = new Set(w.projectiles.map((b) => b.targetId))
  check('...at 5 they all fly out at once', w.projectiles.length === 5 && w.weapons[0].salvo?.bolts.length === 0)
  check('...each at its own enemy', targets.size === 5 && pack.every((e) => targets.has(e.id)))
  check('...same damage per bolt as ever', w.projectiles.every((b) => near(b.damage, damageOf(w))))
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  for (let n = 0; n < 8; n++) cast(w)
  check('Salvo, nothing in range: fills to 5 and waits', w.projectiles.length === 0 && w.weapons[0].salvo?.bolts.length === 5)
  enemy(w, 150, 0)
  cast(w)
  check('...and lets go once something turns up', w.projectiles.length === 5)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_split', 2)
  enemy(w, 150, 0)
  cast(w)
  check('Salvo + Split Shot: a cast adds 3 weaker bolts', w.weapons[0].salvo?.bolts.length === 3 && w.projectiles.length === 0)
  cast(w)
  check('...never more than 5 a release, the extra waits', w.projectiles.length === 5 && w.weapons[0].salvo?.bolts.length === 1)
  check('...one main bolt per cast', w.projectiles.filter((b) => (b.mutations?.fork ?? 0) > 0 || (b.mutations?.returns ?? 0) > 0).length <= 2)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_hotstreak')
  enemy(w, 150, 0)
  for (let n = 0; n < 5; n++) cast(w)
  check('Salvo + Hot Streak: one white-hot bolt a volley', w.projectiles.filter((b) => b.whiteHot).length === 1)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_return')
  enemy(w, 120, 0)
  for (let n = 0; n < 5; n++) cast(w)
  fly(w, 4)
  const salvo = w.weapons[0].salvo!
  check('Salvo + Return: each caught bolt is half a charge', near(salvo.bolts.length + salvo.partial, 5 * config.combat.salvoCatch), `${salvo.bolts.length} + ${salvo.partial}`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
