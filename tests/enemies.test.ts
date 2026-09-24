// Checks each new enemy behaviour through the real simulation code.
import { findEnemyDef } from '@game/data/enemies'
import { updateCombat } from '@game/sim/combat'
import { updateContactDamage } from '@game/sim/damage'
import { damageEnemy } from '@game/sim/damageEnemy'
import { updateEnemies } from '@game/sim/enemyMovement'
import { createWorld, type Enemy, type World } from '@game/sim/world'
import { updateSpawner } from '@game/sim/spawner'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} ${detail}`)
  if (!ok) failures++
}

function setup(): World {
  const world = createWorld(1)
  world.weapons = []
  world.character.hp = 1000
  world.character.maxHp = 1000
  return world
}
function add(world: World, id: string, x: number, y: number, hp?: number): Enemy {
  const def = findEnemyDef(id)!
  const e: Enemy = { id: world.nextEnemyId++, def, x, y, hp: hp ?? def.baseHp, maxHp: hp ?? def.baseHp, speed: def.stationary ? 0 : def.baseSpeed, effects: [], stride: 0 }
  world.enemies.push(e)
  return e
}
function step(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    updateEnemies(world, DT)
    updateCombat(world, DT)
    updateContactDamage(world, DT)
  }
}

// Boar: winds up, then charges through him once, for impact damage.
{
  const world = setup()
  const boar = add(world, 'enemy_charger_01', 200, 0, 1e6)
  boar.chargeReady = 0
  const modes = new Set<string>()
  let hpBefore = world.character.hp
  let impact = 0
  for (let i = 0; i < 180; i++) {
    step(world, DT)
    if (boar.mode) modes.add(boar.mode)
    const lost = hpBefore - world.character.hp
    if (lost > impact) impact = lost
    hpBefore = world.character.hp
  }
  check('Boar winds up, charges, recovers', modes.has('windup') && modes.has('charge') && modes.has('recover'), [...modes].join(','))
  check('Boar charge hits him once', impact >= 15, `biggest single-step loss ${impact.toFixed(1)}`)
  check('Boar ran past him', boar.x < -30, `boar ended at x ${boar.x.toFixed(0)}`)
}

// Fire wisp: lights when close, explodes after its fuse, hurts him, hurts nearby crabs.
{
  const world = setup()
  const wisp = add(world, 'enemy_bomber_01', 80, 0)
  const crab = add(world, 'enemy_basic_01', 40, 30, 1e6)
  crab.speed = 0
  let litAt = -1
  let goneAt = -1
  for (let i = 0; i < 240; i++) {
    step(world, DT)
    if (litAt < 0 && wisp.fuseLeft !== undefined) litAt = world.time
    if (goneAt < 0 && !world.enemies.includes(wisp)) goneAt = world.time
  }
  const fuse = goneAt - litAt
  check('Wisp lights, then goes off', litAt > 0 && goneAt > 0 && Math.abs(fuse - 0.9) < 0.1, `lit ${litAt.toFixed(2)}s, bang ${goneAt.toFixed(2)}s, fuse ${fuse.toFixed(2)}s`)
  check('Blast hurts him', world.blastsTaken === 1 && world.character.hp < 1000, `hp ${world.character.hp.toFixed(1)}, blasts ${world.blastsTaken}`)
  check('Blast hurts enemies in it', crab.hp < crab.maxHp, `crab lost ${(crab.maxHp - crab.hp).toFixed(1)}`)
  check('Going off is not a kill', world.kills === 0, `kills ${world.kills}`)
}

// Stinkcap: stays put, leaves gas on death that hurts him while inside.
{
  const world = setup()
  const cap = add(world, 'enemy_gasshroom_01', 30, 0)
  const x0 = cap.x
  step(world, 1)
  check('Stinkcap never moves', cap.x === x0, `x ${x0} -> ${cap.x}`)
  // Push a crab into it: the mushroom must not be shoved.
  add(world, 'enemy_basic_01', 31, 0, 1e6).speed = 0
  step(world, 0.5)
  check('Stinkcap is not shoved', cap.x === x0 && cap.y === 0, `at ${cap.x.toFixed(1)},${cap.y.toFixed(1)}`)
  world.enemies = world.enemies.filter((e) => e === cap)
  damageEnemy(world, cap, 999, null)
  step(world, DT)
  check('Gas left behind', world.hazards.length === 1, `${world.hazards.length} hazard(s)`)
  const before = world.character.hp
  step(world, 1)
  const lost = before - world.character.hp
  check('Gas hurts him inside it', lost > 8, `lost ${lost.toFixed(1)} in 1s`)
  step(world, 5)
  check('Gas clears', world.hazards.length === 0, `${world.hazards.length} left after 6s`)
}

// Redcap: bursts into sporelings that run at him and blow up on arrival.
{
  const world = setup()
  const cap = add(world, 'enemy_broodshroom_01', 150, 0)
  damageEnemy(world, cap, 999, null)
  step(world, DT)
  const spores = world.enemies.filter((e) => e.def.id === 'enemy_sporeling_01')
  check('Redcap bursts into 4 sporelings', spores.length === 4, `${spores.length}`)
  step(world, 3)
  const left = world.enemies.filter((e) => e.def.id === 'enemy_sporeling_01').length
  check('Sporelings reach him and blow up', left === 0 && world.blastsTaken >= 1, `${left} left, blasts on him ${world.blastsTaken}, hp ${world.character.hp.toFixed(0)}`)
}

// Sporeling killed: explodes, and the chain takes its neighbours.
{
  const world = setup()
  const a = add(world, 'enemy_sporeling_01', 300, 0)
  const b = add(world, 'enemy_sporeling_01', 320, 0)
  const crab = add(world, 'enemy_basic_01', 300, 20)
  a.speed = b.speed = crab.speed = 0
  damageEnemy(world, a, 999, null)
  step(world, DT)
  check('Killed sporeling explodes, chain', !world.enemies.includes(b) && !world.enemies.includes(crab), `b gone ${!world.enemies.includes(b)}, crab gone ${!world.enemies.includes(crab)}, kills ${world.kills}`)
  check('Far blast does not hurt him', world.blastsTaken === 0, `blasts ${world.blastsTaken}`)
}

// Flying: the air and the ground don't collide with each other.
{
  const world = setup()
  const crab = add(world, 'enemy_basic_01', 300, 0, 1e6)
  const bat = add(world, 'enemy_fast_01', 302, 0, 1e6)
  crab.speed = bat.speed = 0
  step(world, 0.5)
  check('Bat and crab pass through each other', crab.x === 300 && bat.x === 302, `crab ${crab.x.toFixed(1)}, bat ${bat.x.toFixed(1)}`)
  const crab2 = add(world, 'enemy_basic_01', 302, 0, 1e6)
  crab2.speed = 0
  step(world, 0.5)
  check('Two crabs still push apart', Math.abs(crab2.x - crab.x) > 15, `gap ${Math.abs(crab2.x - crab.x).toFixed(1)}`)
  const bat2 = add(world, 'enemy_fast_01', 304, 0, 1e6)
  bat2.speed = 0
  step(world, 0.5)
  check('Two bats still push apart', Math.abs(bat2.x - bat.x) > 12, `gap ${Math.abs(bat2.x - bat.x).toFixed(1)}`)
}

// Spawner: stationary caps hold, and sporelings never spawn on their own.
{
  const world = setup()
  world.time = 1200
  for (let i = 0; i < 60 * 120; i++) {
    world.time += DT
    updateSpawner(world, DT, 700, 400)
  }
  const count = (id: string) => world.enemies.filter((e) => e.def.id === id).length
  check('Stinkcaps capped at 12', count('enemy_gasshroom_01') <= 12, `${count('enemy_gasshroom_01')}`)
  check('Redcaps capped at 8', count('enemy_broodshroom_01') <= 8, `${count('enemy_broodshroom_01')}`)
  check('No sporelings from the spawner', count('enemy_sporeling_01') === 0, `${count('enemy_sporeling_01')}`)
  check('Stationary spawn with no speed', world.enemies.filter((e) => e.def.stationary).every((e) => e.speed === 0), '')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
