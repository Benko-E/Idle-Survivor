// Firebolt's upgrades, and the rules they run on: spell-only upgrades,
// prerequisites, keywords, evolutions — all through the real simulation.
import { config } from '@game/config'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { spellTags, weaponStat } from '@game/sim/stats'
import { applyCondition, hasCondition } from '@game/sim/statusEffects'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(44)} ${detail}`)
  if (!ok) failures++
}
const up = (id: string) => UPGRADE_DEFS.find((def) => def.id === id)!
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
/** One cast, then let it fly for a while with nothing else casting. */
function castAndFly(world: World, seconds = 1.5): void {
  world.weapons[0].cooldownRemaining = 0
  rebuildEnemyGrid(world)
  updateCombat(world, DT)
  world.weapons[0].cooldownRemaining = 99
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    rebuildEnemyGrid(world)
    updateCombat(world, DT)
  }
}
const lost = (e: Enemy) => e.maxHp - e.hp

// --- Offering rules ------------------------------------------------------------

{
  const fire = createWorld(1, 'spell_bolt_01')
  const frost = createWorld(1, 'spell_frostbolt_01')
  check('Firebolt upgrades offered with Firebolt', eligible(fire, 'up_fb_ignite') && eligible(fire, 'up_fb_fork'))
  check('...and never without it', !eligible(frost, 'up_fb_ignite') && !eligible(frost, 'up_fb_fork'))

  check('Combustion needs Ignite first', !eligible(fire, 'up_fb_combust'))
  take(fire, 'up_fb_ignite')
  check('...offered once Ignite is in', eligible(fire, 'up_fb_combust'))

  check('Hot Streak needs Pierce and Fork', !eligible(fire, 'up_fb_hotstreak'))
  take(fire, 'up_fb_pierce')
  check('...not with Pierce alone', !eligible(fire, 'up_fb_hotstreak'))
  take(fire, 'up_fb_fork')
  check('...offered with both', eligible(fire, 'up_fb_hotstreak'))

  check('Ignite stacks to 3, then stops', (take(fire, 'up_fb_ignite', 2), !eligible(fire, 'up_fb_ignite')))
  check('Ignite gives Firebolt the burning keyword', spellTags(fire, fire.weapons[0]).includes('burning'))
}
{
  const w = createWorld(1, 'spell_bolt_01')
  w.level = config.draft.evolutionLevel - 1
  check('No evolutions before their level', !eligible(w, 'up_fb_fireball') && !eligible(w, 'up_fb_phoenix'))
  w.level = config.draft.evolutionLevel
  check('Both evolutions offered at their level', eligible(w, 'up_fb_fireball') && eligible(w, 'up_fb_phoenix'))
  take(w, 'up_fb_phoenix')
  check('Taking one rules out the other for the run', !eligible(w, 'up_fb_fireball'))
  check('Phoenix Bolt retires Pierce', !eligible(w, 'up_fb_pierce'))
}

// --- Picks for one spell touch only that spell ----------------------------------

{
  const w = createWorld(1, 'spell_bolt_01')
  const orb = WEAPON_DEFS.find((def) => def.id === 'spell_orb_01')!
  w.weapons.push({ def: orb, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 })
  take(w, 'up_fb_fork', 3)
  take(w, 'up_fb_pierce', 2)
  const [bolt, frozenOrb] = w.weapons
  check('Fork x3 on Firebolt', weaponStat(w, bolt, 'fork') === 3)
  check('...and none of it on Frozen Orb', weaponStat(w, frozenOrb, 'fork') === 0, `orb fork ${weaponStat(w, frozenOrb, 'fork')}`)
  check('Pierce on Firebolt only', weaponStat(w, bolt, 'pierce') === 2 && weaponStat(w, frozenOrb, 'pierce') === orb.stats.pierce)
}

// --- What each one does ------------------------------------------------------------

// Ignite: the target burns for a share of the hit.
{
  const w = createWorld(1)
  take(w, 'up_fb_ignite')
  const e = enemy(w, 90, 0)
  castAndFly(w, 0.5)
  const burn = e.effects.find((f) => f.condition === 'burning')
  const want = (WEAPON_DEFS[0].stats.damage * 0.4) / config.combat.igniteSeconds
  check('Ignite sets the target burning', !!burn && Math.abs(burn.magnitude - want) < 1e-9, `${burn?.magnitude.toFixed(2)}/s (want ${want.toFixed(2)})`)
}
// Fork: a second enemy nearby takes a plain half-damage bolt.
{
  const w = createWorld(1)
  take(w, 'up_fb_fork')
  const first = enemy(w, 90, 0)
  const second = enemy(w, 150, 90)
  castAndFly(w)
  const damage = WEAPON_DEFS[0].stats.damage
  check('Fork hits a second enemy for half', lost(first) === damage && Math.abs(lost(second) - damage * config.combat.forkDamage) < 1e-9, `first ${lost(first)}, second ${lost(second)}`)
}
// Pierce: the enemy behind gets hit too.
{
  const w = createWorld(1)
  const a = enemy(w, 80, 0), b = enemy(w, 160, 0)
  castAndFly(w)
  const plain = [lost(a) > 0, lost(b) > 0]
  const w2 = createWorld(1)
  take(w2, 'up_fb_pierce')
  const c = enemy(w2, 80, 0), d = enemy(w2, 160, 0)
  castAndFly(w2)
  check('Pierce reaches the enemy behind', plain[0] && !plain[1] && lost(c) > 0 && lost(d) > 0)
}
// Returning Bolt: out, back, one enemy hit twice.
{
  const w = createWorld(1)
  take(w, 'up_fb_return')
  const e = enemy(w, 120, 0)
  castAndFly(w, 3)
  const damage = WEAPON_DEFS[0].stats.damage
  check('Returning Bolt hits on the way out and back', lost(e) === damage * 2, `took ${lost(e)} (one hit is ${damage})`)
  check('...and is gone once it reaches him', w.projectiles.length === 0, `${w.projectiles.length} still flying`)
}
// Combustion: a burn already on the target goes off at once, and chains.
{
  const w = createWorld(1)
  take(w, 'up_fb_ignite')
  take(w, 'up_fb_combust')
  const target = enemy(w, 90, 0)
  const neighbour = enemy(w, 110, 20)
  // Near both of them, so it's caught by both blasts.
  const bystander = enemy(w, 104, 8)
  // Burning from something else — Righteous Fire, say: 10 a second for 3s.
  applyCondition(w, target, 'burning', 10, 3, null)
  applyCondition(w, neighbour, 'burning', 10, 3, null)
  castAndFly(w, 0.3)
  const damage = WEAPON_DEFS[0].stats.damage
  check('Combustion detonates the burn: 30 at once', lost(target) >= damage + 30 - 0.5, `target took ${lost(target).toFixed(1)} (hit ${damage} + burn 30)`)
  check('...a burning enemy caught in it goes off too', lost(bystander) >= 55, `bystander took ${lost(bystander).toFixed(1)} from two blasts`)
  check('...and Ignite lights a fresh burn after', hasCondition(target, 'burning'))
}
// Hot Streak: the 5th cast's bolt is empowered.
{
  const w = createWorld(1)
  take(w, 'up_fb_pierce')
  take(w, 'up_fb_fork')
  take(w, 'up_fb_hotstreak')
  enemy(w, 400, 0)
  const flags: boolean[] = []
  for (let cast = 0; cast < 5; cast++) {
    w.projectiles.length = 0
    w.weapons[0].cooldownRemaining = 0
    rebuildEnemyGrid(w)
    updateCombat(w, DT)
    flags.push(w.projectiles[0]?.empowered === true)
  }
  const hot = w.projectiles[0]
  check('Hot Streak: every 5th bolt is empowered', flags.join() === 'false,false,false,false,true', flags.map((f) => (f ? 'HOT' : '-')).join(' '))
  check('...pierces everything, forks every hit', !!hot && hot.pierce >= 999 && hot.mutations?.forkEveryHit === true)
}
// Backdraft: hurt, a ring of plain bolts; hurt again at once, nothing.
{
  const w = createWorld(1)
  take(w, 'up_fb_backdraft')
  w.weapons[0].cooldownRemaining = 99
  w.lastHurtAt = w.time
  updateCombat(w, DT)
  const first = w.projectiles.length
  w.projectiles.length = 0
  w.time += 1
  w.lastHurtAt = w.time
  updateCombat(w, DT)
  const again = w.projectiles.length
  w.projectiles.length = 0
  w.time += config.combat.backdraftCooldown
  w.lastHurtAt = w.time
  updateCombat(w, DT)
  check('Backdraft: 8 plain bolts when hurt', first === 8 && w.projectiles.every((p) => !p.mutations), `${first} bolts`)
  check('...then waits out its cooldown', again === 0 && w.projectiles.length === 8, `${again} during cooldown, ${w.projectiles.length} after`)
}
// Fireball: slow, heavy, explodes on every hit; forks stay plain firebolts.
{
  const w = createWorld(1)
  take(w, 'up_fb_fork')
  w.level = config.draft.evolutionLevel
  take(w, 'up_fb_fireball')
  const target = enemy(w, 90, 0)
  const nearby = enemy(w, 115, 25)
  w.weapons[0].cooldownRemaining = 0
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  const ball = w.projectiles[0]
  const base = WEAPON_DEFS[0].stats
  check('Fireball is slower and hits harder', Math.hypot(ball.vx, ball.vy) < base.speed * 0.5 && ball.damage > base.damage * 2)
  w.weapons[0].cooldownRemaining = 99
  let forks: typeof w.projectiles = []
  for (let i = 0; i < 90; i++) {
    w.time += DT
    rebuildEnemyGrid(w)
    updateCombat(w, DT)
    const spawned = w.projectiles.filter((p) => p !== ball)
    if (spawned.length > 0 && forks.length === 0) forks = spawned
  }
  check('...its blast hits the enemy next to the target', lost(nearby) > 0 && lost(target) >= ball.damage, `target ${lost(target).toFixed(0)}, nearby ${lost(nearby).toFixed(0)}`)
  check('...and its forks are plain firebolts', forks.length > 0 && forks.every((p) => !p.mutations && Math.hypot(p.vx, p.vy) === base.speed), `${forks.length} fork(s)`)
}
// Phoenix Bolt: pierces everything, leaves burning ground; earlier Pierce heats it.
{
  const trailOf = (pierceTaken: number) => {
    const w = createWorld(1)
    take(w, 'up_fb_pierce', pierceTaken)
    w.level = config.draft.evolutionLevel
    take(w, 'up_fb_phoenix')
    const line = [enemy(w, 80, 0), enemy(w, 150, 0), enemy(w, 220, 0), enemy(w, 290, 0)]
    castAndFly(w, 0.9)
    return { w, line, trail: w.zones.filter((z) => z.quiet && z.condition?.id === 'burning') }
  }
  const plain = trailOf(0)
  const heated = trailOf(2)
  check('Phoenix Bolt pierces the whole line', plain.line.every((e) => lost(e) > 0))
  check('...and leaves a trail of burning ground', plain.trail.length >= 8, `${plain.trail.length} patches`)
  const a = plain.trail[0]?.condition?.magnitude ?? 0
  const b = heated.trail[0]?.condition?.magnitude ?? 0
  check('...hotter for each Pierce taken before it', Math.abs(b - a * 1.5) < 1e-9, `trail ${a} -> ${b} with 2 Pierce`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
