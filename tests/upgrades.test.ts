// Plays out the new upgrade mechanics in the real simulation code.
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { updateContactDamage } from '@game/sim/damage'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { updateVitals } from '@game/sim/vitals'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
// Shelved spells are switched off in the data, but their mechanics are
// still in the code for later; switch everything on to test them.
for (const def of WEAPON_DEFS) def.enabled = true
let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`)
  if (!ok) failures++
}
function take(world: World, id: string, times = 1): void {
  const up = UPGRADE_DEFS.find((u) => u.id === id)!
  for (let i = 0; i < times; i++) world.modifiers.push(...up.modifiers)
}
let nextId = 1
function enemy(world: World, x: number, y: number, hp = 1e9) {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  world.enemies.push(e)
  return e
}

// Hardy: max health up, and the gain is healed.
{
  const w = createWorld(1)
  w.character.hp = 50
  take(w, 'up_vigour_01', 2)
  updateVitals(w, DT)
  check('Hardy x2', w.character.maxHp === 140 && Math.abs(w.character.hp - (90 + DEFAULT_CLASS.stats.hpRegen * DT)) < 1e-9, `max ${w.character.maxHp}, hp 50 -> ${w.character.hp}`)
}
// Second Wind: 1/s, capped at max.
{
  const w = createWorld(1)
  w.character.hp = 50
  take(w, 'up_regen_01')
  for (let i = 0; i < 600; i++) updateVitals(w, DT)
  const after10 = w.character.hp
  for (let i = 0; i < 60 * 100; i++) updateVitals(w, DT)
  check('Second Wind', Math.abs(after10 - (60 + DEFAULT_CLASS.stats.hpRegen * 10)) < 0.01 && w.character.hp === 100, `hp 50 -> ${after10.toFixed(2)} after 10s, capped at ${w.character.hp}`)
}
// Warding: same contact, less damage; compounds.
{
  const hit = (stacks: number) => {
    const w = createWorld(1)
    take(w, 'up_ward_01', stacks)
    enemy(w, 0, 0)
    for (let i = 0; i < 60; i++) updateContactDamage(w, DT)
    return 100 - w.character.hp
  }
  const [a, b, c] = [hit(0), hit(1), hit(4)]
  check('Warding x1 / x4', Math.abs(b / a - 0.9) < 1e-6 && Math.abs(c / a - 0.6561) < 1e-6, `1s contact: ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} dmg`)
}
// Quickened Mind: cooldown after a cast = base / recovery.
{
  const cd = (stacks: number) => {
    const w = createWorld(1)
    take(w, 'up_haste_01', stacks)
    enemy(w, 100, 0)
    rebuildEnemyGrid(w)
    w.weapons[0].cooldownRemaining = 0
    updateCombat(w, DT)
    return w.weapons[0].cooldownRemaining
  }
  const [a, b, c] = [cd(0), cd(1), cd(5)]
  check('Quickened Mind x1 / x5', Math.abs(a - 0.95) < 1e-9 && Math.abs(b - 0.95 / 1.15) < 1e-9 && Math.abs(c - 0.95 / 1.75) < 1e-9, `cooldown ${a.toFixed(3)} / ${b.toFixed(3)} / ${c.toFixed(3)}s`)
}
// Splitting Bolt: two bolts, two different enemies.
{
  const w = createWorld(1)
  take(w, 'up_multishot_01')
  const near = enemy(w, 100, 0), other = enemy(w, 0, 140)
  rebuildEnemyGrid(w)
  w.weapons[0].cooldownRemaining = 0
  updateCombat(w, DT)
  const headings = w.projectiles.map((p) => Math.round((Math.atan2(p.vy, p.vx) * 180) / Math.PI))
  for (let i = 0; i < 90; i++) { rebuildEnemyGrid(w); updateCombat(w, DT) }
  const hitBoth = near.hp < near.maxHp && other.hp < other.maxHp
  check('Splitting Bolt, 2 targets', w.weapons[0].timesCast >= 1 && headings.length === 2 && hitBoth, `bolt headings ${headings.join('°, ')}°, both enemies hit: ${hitBoth}`)
}
// Splitting Bolt with one target: second bolt fans by `spread`.
{
  const w = createWorld(1)
  take(w, 'up_multishot_01')
  enemy(w, 100, 0)
  rebuildEnemyGrid(w)
  w.weapons[0].cooldownRemaining = 0
  updateCombat(w, DT)
  const angles = w.projectiles.map((p) => Math.atan2(p.vy, p.vx))
  check('Splitting Bolt, 1 target', angles.length === 2 && Math.abs(Math.abs(angles[1] - angles[0]) - 0.14) < 1e-9, `angles ${angles.map((a) => a.toFixed(2)).join(', ')} rad`)
}
// Lancing Bolt: passes through the first enemy into a second in line.
{
  const run = (stacks: number) => {
    const w = createWorld(1)
    take(w, 'up_pierce_01', stacks)
    const first = enemy(w, 80, 0), second = enemy(w, 160, 0)
    w.weapons[0].cooldownRemaining = 0
    rebuildEnemyGrid(w)
    updateCombat(w, DT)
    w.weapons[0].cooldownRemaining = 99
    for (let i = 0; i < 90; i++) { rebuildEnemyGrid(w); updateCombat(w, DT) }
    return [first.hp < first.maxHp, second.hp < second.maxHp]
  }
  const [base, pierced] = [run(0), run(1)]
  check('Lancing Bolt', base[0] && !base[1] && pierced[0] && pierced[1], `no pierce hits ${base}, with pierce hits ${pierced}`)
}
// Permafrost: chill on a nova target is stronger and longer.
{
  const w = createWorld(1)
  w.weapons = [{ def: WEAPON_DEFS.find((d) => d.behaviour === 'nova')!, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }]
  take(w, 'up_chill_01')
  const e = enemy(w, 50, 0)
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  const slow = e.effects.find((f) => f.condition === 'chilled')
  check('Permafrost', !!slow && Math.abs(slow.magnitude - 0.55) < 1e-9 && Math.abs(slow.remaining - (3.12 - DT)) < 1e-6, `slow ${slow?.magnitude.toFixed(2)}, lasting ${slow?.remaining.toFixed(2)}s`)
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
