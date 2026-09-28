// The new build's Chain Lightning (spellbook, Version 12): the chain, its
// generic chain upgrades and its mutations, through the real simulation.
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { config } from '@game/config'
import { damageEnemy } from '@game/sim/damageEnemy'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { applyCondition } from '@game/sim/statusEffects'
import { upgradeChanges } from '@game/sim/upgradeInfo'
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

// --- +1 Jump and Branching -----------------------------------------------------------

{
  const w = chainWorld()
  check('+1 Jump and Branching offered with Chain Lightning', eligible(w, 'up_cl_jump') && eligible(w, 'up_cl_branch'))
  check('...never with the old one', !eligible(createWorld(1, 'spell_chain_01'), 'up_cl_jump'))
  take(w, 'up_cl_jump')
  const six = line(w, 6)
  cast(w)
  check('+1 Jump: five enemies struck', six.filter((e) => lost(e) > 0).length === 5)
}
{
  const w = chainWorld()
  take(w, 'up_cl_branch')
  // The side enemy is in the branch's reach of the first, but out of the
  // chain's jump from the second, so only the branch touches it.
  const first = enemy(w, 90, 0)
  enemy(w, 170, 0)
  const side = enemy(w, 20, 100)
  cast(w)
  check('Branching: the first jump splits off to another enemy', near(lost(side), lost(first) * config.chain.branchShare), `${lost(side).toFixed(2)} vs ${lost(first).toFixed(2)}`)
  check('...plain: nothing but the damage', side.effects.length === 0)
}

// --- Shock ------------------------------------------------------------------------

{
  const w = chainWorld()
  take(w, 'up_cl_shock')
  const [a] = line(w, 4)
  cast(w)
  const shock = a.effects.find((effect) => effect.condition === 'shocked')
  check('Shock: its hits leave enemies shocked', !!shock && near(shock.magnitude, 0.2) && near(shock.remaining, config.chain.shockSeconds, 0.05))
  const before = lost(a)
  damageEnemy(w, a, 10, null)
  check('...shocked enemies take more from everything', near(lost(a) - before, 12, 1e-6), `${(lost(a) - before).toFixed(2)} from a 10 hit`)
  cast(w)
  check("...and it doesn't stack", a.effects.filter((effect) => effect.condition === 'shocked').length === 1)
}

// --- Conduction ---------------------------------------------------------------------

{
  const w = chainWorld()
  check('Conduction needs Shock first', !eligible(w, 'up_cl_conduction'))
  take(w, 'up_cl_shock')
  check('...offered once it is in', eligible(w, 'up_cl_conduction'))
  take(w, 'up_cl_conduction')
  const eight = line(w, 8)
  cast(w)
  check('...without shocked enemies: jumps as usual', eight.filter((e) => lost(e) > 0).length === 4)
}
{
  const w = chainWorld()
  take(w, 'up_cl_shock')
  take(w, 'up_cl_conduction')
  const eight = line(w, 8)
  for (const e of eight) applyCondition(w, e, 'shocked', 0.2, 10, null)
  cast(w)
  check("...jumps onto shocked enemies don't use a jump", eight.every((e) => lost(e) > 0), `${eight.filter((e) => lost(e) > 0).length} of 8`)
}

// --- Crescendo ----------------------------------------------------------------------

{
  const w = chainWorld()
  take(w, 'up_cl_crescendo')
  const four = line(w, 4)
  cast(w)
  const k = [0.5, 0.75, 1, 2.5].map((m) => m * base(w))
  check('Crescendo: weak first, each jump harder, the last doubled', four.every((e, i) => near(lost(e), k[i], 1e-6)), four.map((e) => lost(e).toFixed(2)).join(' / '))
}
{
  const w = chainWorld()
  take(w, 'up_cl_crescendo')
  const [a, b] = line(w, 2)
  cast(w)
  check('...ending early, its real last hit gets the double', near(lost(a), 0.5 * base(w)) && near(lost(b), 1.5 * base(w)))
}

// --- Overload -----------------------------------------------------------------------

/** Let the world run a while: creeping chains, conditions. */
function fly(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    rebuildEnemyGrid(world)
    updateCombat(world, DT)
  }
}
{
  const w = chainWorld()
  take(w, 'up_cl_overload')
  const eight = line(w, 8)
  for (let n = 0; n < 4; n++) cast(w)
  check('Overload: casts 1-4 are ordinary', eight.slice(0, 4).every((e) => lost(e) > 0) && eight.slice(4).every((e) => lost(e) === 0))
  cast(w)
  check('...the 5th creeps: one hit at once', eight.slice(4).every((e) => lost(e) === 0))
  fly(w, 0.7)
  check('...then twice the jumps, one after another', eight.slice(4, 7).every((e) => lost(e) > 0) && lost(eight[7]) === 0 && w.chains.length === 0)
}
{
  const w = chainWorld()
  take(w, 'up_cl_overload')
  const [a, b] = line(w, 3)
  const alt = enemy(w, 130, 80)
  for (let n = 0; n < 4; n++) cast(w)
  const before = lost(alt)
  cast(w)
  b.hp = 0
  fly(w, 0.5)
  check('...its next target dying mid-creep: it jumps on from where it is', lost(a) > 0 && lost(alt) > before && w.chains.length === 0)
}

// --- Static Discharge --------------------------------------------------------------

{
  const w = chainWorld()
  take(w, 'up_cl_static')
  w.weapons[0].cooldownRemaining = 99
  const ring = Array.from({ length: 8 }, (_, k) => enemy(w, Math.cos(k) * 60, Math.sin(k) * 60))
  const far = enemy(w, 300, 0)
  w.lastHurtAt = w.time
  fly(w, DT)
  const hit = ring.filter((e) => lost(e) > 0)
  check('Static Discharge: hurt, and lightning arcs into 6 around him', hit.length === 6 && hit.every((e) => near(lost(e), base(w))) && lost(far) === 0, `${hit.length} arcs`)
  fly(w, 2)
  w.lastHurtAt = w.time
  const total = ring.reduce((sum, e) => sum + lost(e), 0)
  fly(w, DT)
  check('...then not again for a while', ring.reduce((sum, e) => sum + lost(e), 0) === total)
  fly(w, 3.2)
  w.lastHurtAt = w.time
  fly(w, DT)
  check('...until its wait is over', ring.reduce((sum, e) => sum + lost(e), 0) > total)
}

// --- Storm Web ----------------------------------------------------------------------

const webWorld = (...ids: string[]) => {
  const w = chainWorld()
  w.level = 20
  for (const id of ['up_cl_web', ...ids]) take(w, id)
  return w
}
{
  const w = chainWorld()
  w.level = 20
  check('Storm Web is an evolution, offered at 20', up('up_cl_web').kind === 'evolution' && eligible(w, 'up_cl_web'))
  take(w, 'up_cl_web')
  check('...and rules out Wandering Spark', !eligible(w, 'up_cl_spark'))
  const four = line(w, 4)
  cast(w)
  const hits = four.map(lost)
  fly(w, 1.2)
  const { webZaps, webShare } = config.chain
  check('...its links linger, zapping each enemy 3 more times', four.every((e, i) => near(lost(e), hits[i] * (1 + webZaps * webShare), 1e-6)), four.map((e) => lost(e).toFixed(2)).join(' / '))
  check('...then it fades', w.webs.length === 0)
}
{
  const w = webWorld()
  const [a, b, c] = line(w, 3)
  cast(w)
  const before = [lost(a), lost(c)]
  b.hp = 0
  fly(w, 1.2)
  check('...an enemy dying breaks its links, the rest keep zapping', lost(a) > before[0] && lost(c) > before[1])
}
{
  const w = webWorld('up_cl_shock')
  const [a] = line(w, 3)
  cast(w)
  fly(w, 0.9)
  const shock = a.effects.find((effect) => effect.condition === 'shocked')
  check('...every zap refreshes Shock', !!shock && shock.remaining > config.chain.shockSeconds - 0.5, `${shock?.remaining.toFixed(2)}s left`)
}
{
  const w = webWorld('up_cl_crescendo')
  const four = line(w, 4)
  cast(w)
  const last = lost(four[3])
  fly(w, 1.2)
  const zaps = (lost(four[3]) - last) / config.chain.webZaps
  check('...with Crescendo the last enemy takes the big hit every zap', near(zaps, config.chain.webShare * 2.5 * base(w), 1e-6), `${zaps.toFixed(2)} a zap`)
}
{
  const w = webWorld('up_cl_overload')
  line(w, 8)
  for (let n = 0; n < 4; n++) cast(w)
  fly(w, 1.3)
  cast(w)
  check('...Overload creeps first', w.webs.length === 0 && w.chains.length === 1)
  fly(w, 0.6)
  check('...and leaves a giant web behind', w.webs.length === 1 && w.webs[0].nodes.length === 7, `${w.webs[0]?.nodes.length} enemies in it`)
}

// --- Wandering Spark -----------------------------------------------------------------

const sparkWorld = (...ids: string[]) => {
  const w = chainWorld()
  w.level = 20
  for (const id of ['up_cl_spark', ...ids]) take(w, id)
  return w
}
const struckCount = (enemies: Enemy[]) => enemies.filter((e) => lost(e) > 0).length
{
  const w = chainWorld()
  w.level = 20
  check('Wandering Spark is an evolution, offered at 20', up('up_cl_spark').kind === 'evolution' && eligible(w, 'up_cl_spark'))
  take(w, 'up_cl_spark')
  check('...and rules out Storm Web', !eligible(w, 'up_cl_web'))
  const five = line(w, 5)
  cast(w)
  check('...the spark sets off from his hands: nothing hit yet', struckCount(five) === 0)
  fly(w, 0.3)
  const early = struckCount(five)
  fly(w, 0.3)
  check('...then hops from enemy to enemy, one at a time', early === 2 && struckCount(five) === 4 && lost(five[4]) === 0, `${early} by 0.3s, ${struckCount(five)} by 0.6s`)
}
{
  const w = sparkWorld()
  const six = line(w, 6)
  for (const e of six.slice(0, 3)) e.hp = 1
  cast(w)
  fly(w, 1.2)
  check('...every kill gives it another hop', six.slice(3).every((e) => lost(e) > 0), `${six.filter((e) => e.hp <= 0 || lost(e) > 0).length} of 6 reached`)
}
{
  const w = sparkWorld()
  const [a, b] = line(w, 2)
  cast(w)
  fly(w, 1)
  check('...never the same enemy twice', near(lost(a), base(w)) && lost(b) > 0 && w.chains.length === 0)
}
{
  const w = sparkWorld()
  const lone = enemy(w, 100, 0)
  cast(w)
  fly(w, 0.5)
  check('...nothing more in reach: it fizzles out', lost(lone) > 0 && w.chains.length === 0)
}
{
  const w = sparkWorld()
  const [a, b] = line(w, 3)
  const alt = enemy(w, 130, 80)
  cast(w)
  fly(w, 0.15)
  b.hp = 0
  fly(w, 0.6)
  check('...its next enemy dying mid-flight: it finds another', lost(a) > 0 && lost(alt) > 0 && w.chains.length === 0)
}

// --- Found in Phase 5's review -----------------------------------------------------------

{
  // Hurt from afar (an enemy's bolt) with nobody close: it shouldn't waste its wait.
  const w = chainWorld()
  take(w, 'up_cl_static')
  w.weapons[0].cooldownRemaining = 99
  w.lastHurtAt = w.time
  fly(w, DT)
  fly(w, 1)
  const close = enemy(w, 40, 0)
  w.lastHurtAt = w.time
  fly(w, DT)
  check('Static Discharge: hurt with nobody close, it keeps its charge', lost(close) > 0)
}
{
  const w = chainWorld()
  take(w, 'up_cl_jump')
  const change = upgradeChanges(w, up('up_cl_jump')).find((entry) => entry.stat === 'count')
  check("+1 Jump's card reads as chain jumps", change?.label === 'chain jumps', change?.label ?? 'none')
}
{
  // Four in a tight group: Branching must never make the chain reach less.
  const total = (branching: boolean) => {
    const w = chainWorld()
    if (branching) take(w, 'up_cl_branch')
    const group = [enemy(w, 100, 0), enemy(w, 150, 30), enemy(w, 150, -30), enemy(w, 200, 0)]
    cast(w)
    return { damage: group.reduce((sum, e) => sum + lost(e), 0), struck: group.filter((e) => lost(e) > 0).length }
  }
  const plain = total(false)
  const branched = total(true)
  check('Branching never makes the chain do less', branched.damage >= plain.damage - 1e-9 && branched.struck >= plain.struck, `${plain.damage.toFixed(2)} → ${branched.damage.toFixed(2)}`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
