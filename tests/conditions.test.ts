// Checks the enemy conditions (burning, chilled, frozen, shocked) through the
// real simulation, and that a brand-new one needs nothing but a data entry.
import { CONDITION_DEFS } from '@game/data/conditions'
import { ENEMY_DEFS } from '@game/data/enemies'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { damageEnemy } from '@game/sim/damageEnemy'
import { updateEnemies } from '@game/sim/enemyMovement'
import { applyCondition, conditionCount, CONDITION_HOOKS, hasCondition, updateStatusEffects } from '@game/sim/statusEffects'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} ${detail}`)
  if (!ok) failures++
}
function setup(): { world: World; e: Enemy } {
  const world = createWorld(1)
  world.weapons = []
  const e: Enemy = { id: world.nextEnemyId++, def: ENEMY_DEFS[0], x: 300, y: 0, hp: 1000, maxHp: 1000, speed: 50, effects: [], stride: 0 }
  world.enemies.push(e)
  return { world, e }
}
function tick(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    updateStatusEffects(world, DT)
  }
}

// Burning: damage per second, for its duration.
{
  const { world, e } = setup()
  applyCondition(world, e, 'burning', 10, 2, null)
  tick(world, 3)
  check('Burning deals its damage over time', Math.abs(1000 - e.hp - 20) < 0.5, `lost ${(1000 - e.hp).toFixed(1)} (want 20)`)
  check('Burning wears off', !hasCondition(e, 'burning'), '')
}
// Two spells' burns both count; the same spell's twice doesn't stack.
{
  const { world, e } = setup()
  const a = { def: WEAPON_DEFS[0], cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }
  const b = { def: WEAPON_DEFS[1], cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }
  applyCondition(world, e, 'burning', 10, 1, a)
  applyCondition(world, e, 'burning', 10, 1, a)
  applyCondition(world, e, 'burning', 10, 1, b)
  check('Refresh: same spell once, other spells alongside', conditionCount(e, 'burning') === 2, `${conditionCount(e, 'burning')} burns`)
}
// Chilled slows, strongest wins; frozen stops it dead, then immunity.
{
  const { world, e } = setup()
  applyCondition(world, e, 'chilled', 0.5, 5, null)
  const x0 = e.x
  world.character.x = 0
  for (let i = 0; i < 60; i++) { world.time += DT; updateEnemies(world, DT) }
  const chilledMoved = x0 - e.x
  check('Chilled halves its speed', Math.abs(chilledMoved - 25) < 1.5, `moved ${chilledMoved.toFixed(1)} in 1s at speed 50 (want 25)`)

  applyCondition(world, e, 'frozen', 1, 1, null)
  const x1 = e.x
  for (let i = 0; i < 30; i++) { world.time += DT; updateEnemies(world, DT); updateStatusEffects(world, DT) }
  check('Frozen stops it dead', e.x === x1, `moved ${(x1 - e.x).toFixed(2)}`)
  tick(world, 1)
  check('Frozen thaws after its duration', !hasCondition(e, 'frozen'), '')
  applyCondition(world, e, 'frozen', 1, 1, null)
  check('Immune to freezing straight after', !hasCondition(e, 'frozen'), `immune until ${e.immuneUntil?.frozen?.toFixed(2)}, now ${world.time.toFixed(2)}`)
  tick(world, 2.1)
  applyCondition(world, e, 'frozen', 1, 1, null)
  check('Freezable again once immunity ends', hasCondition(e, 'frozen'), '')
}
// Shocked: more damage from every hit.
{
  const { world, e } = setup()
  damageEnemy(world, e, 100, null)
  const plain = 1000 - e.hp
  applyCondition(world, e, 'shocked', 0.25, 3, null)
  const before = e.hp
  damageEnemy(world, e, 100, null)
  check('Shocked takes +25% from hits', Math.abs(before - e.hp - plain * 1.25) < 0.01, `${plain} plain, ${(before - e.hp).toFixed(1)} shocked`)
}
// The spells still apply what they used to, under the new names.
{
  const { world, e } = setup()
  world.weapons = [{ def: WEAPON_DEFS.find((d) => d.id === 'spell_frostbolt_01')!, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }]
  e.x = 150; e.speed = 0
  for (let i = 0; i < 60; i++) { world.time += DT; updateEnemies(world, 0); updateCombat(world, DT) }
  check('Frostbolt chills', hasCondition(e, 'chilled'), e.effects.map((f) => f.condition).join(','))
}
{
  const { world, e } = setup()
  world.weapons = [{ def: WEAPON_DEFS.find((d) => d.id === 'spell_aura_01')!, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }]
  e.x = 40; e.speed = 0
  for (let i = 0; i < 60; i++) { world.time += DT; updateEnemies(world, 0); updateCombat(world, DT) }
  check('Righteous Fire burns', hasCondition(e, 'burning') && e.hp < 1000, `${e.effects.map((f) => f.condition).join(',')}, lost ${(1000 - e.hp).toFixed(0)}`)
}

// A new condition is a data entry: poison that stacks to 3.
{
  CONDITION_DEFS.push({ id: 'poisoned', displayName: 'Poisoned', effect: 'damage', stacking: 'stack', maxStacks: 3, tint: '#7fd34e', tintStrength: 0.35 })
  const { world, e } = setup()
  for (let i = 0; i < 5; i++) applyCondition(world, e, 'poisoned', 4, 2, null)
  check('New condition from data alone: stacks', conditionCount(e, 'poisoned') === 3, `${conditionCount(e, 'poisoned')} stacks (cap 3)`)
  tick(world, 1)
  check('...and each stack ticks', Math.abs(1000 - e.hp - 12) < 0.5, `lost ${(1000 - e.hp).toFixed(1)} in 1s (want 12)`)
}
// A hook for anything stranger: bleeding that only hurts while moving.
{
  CONDITION_DEFS.push({ id: 'bleeding', displayName: 'Bleeding', effect: 'damage', stacking: 'refresh', tint: '#c0282d', tintStrength: 0.3 })
  const last = new WeakMap<Enemy, number>()
  CONDITION_HOOKS.bleeding = {
    tick(world, enemy, effect, dt) {
      const moved = Math.abs(enemy.x - (last.get(enemy) ?? enemy.x))
      last.set(enemy, enemy.x)
      if (moved > 0.01) damageEnemy(world, enemy, effect.magnitude * 3 * dt, effect.source, true)
    },
  }
  const { world, e } = setup()
  applyCondition(world, e, 'bleeding', 5, 5, null)
  tick(world, 1)
  const still = 1000 - e.hp
  const hp = e.hp
  for (let i = 0; i < 60; i++) { world.time += DT; e.x -= 1; updateStatusEffects(world, DT) }
  const moving = hp - e.hp
  check('Hook: bleeding hurts more while moving', moving > still * 3, `still ${still.toFixed(1)}/s, moving ${moving.toFixed(1)}/s`)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
