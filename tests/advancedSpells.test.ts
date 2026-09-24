// The three new spells and the reworked storm, through the real sim code.
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { updateEnemies } from '@game/sim/enemyMovement'
import { orbitPositions } from '@game/sim/orbit'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} ${detail}`)
  if (!ok) failures++
}
let nextId = 1
function world(spellId: string): World {
  const w = createWorld(1)
  w.weapons = [{ def: WEAPON_DEFS.find((d) => d.id === spellId)!, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }]
  return w
}
function enemy(w: World, x: number, y: number, hp = 1e6): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  w.enemies.push(e)
  return e
}
function step(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) { w.time += DT; updateEnemies(w, 0); updateCombat(w, DT) }
}

// Frozen Orb: through a whole line, chilling each.
{
  const w = world('spell_orb_01')
  const line = [80, 130, 180, 230, 280, 330].map((x) => enemy(w, x, 0))
  step(w, 0.05)
  w.weapons[0].cooldownRemaining = 99
  const everChilled = new Set<number>()
  for (let i = 0; i < 180; i++) { step(w, DT); for (const e of line) if (e.effects.some((f) => f.condition === 'chilled')) everChilled.add(e.id) }
  const hit = line.filter((e) => e.hp < e.maxHp).length
  check('Frozen Orb pierces the whole line', hit === 6 && everChilled.size === 6, `${hit}/6 hit, ${everChilled.size}/6 chilled on the way`)
}
// Ball Lightning: hits an enemy parked on its orbit, but not every frame.
{
  const w = world('spell_ball_01')
  const orb = orbitPositions(w, w.weapons[0])[0]
  const target = enemy(w, orb.x, orb.y)
  const far = enemy(w, 400, 0)
  step(w, 4)
  const hits = Math.round((target.maxHp - target.hp) / 14)
  // Two orbs, ~2 s per lap: roughly 2 passes a lap, capped at one hit per 0.5 s.
  check('Ball Lightning hits what it touches', hits >= 3 && hits <= 9 && far.hp === far.maxHp, `${hits} hits in 4s on an enemy in its path, far one untouched`)
}
// Blizzard: everything inside chilled and ground down over its duration.
{
  const w = world('spell_blizzard_01')
  const crowd = [0, 1, 2, 3, 4, 5].map((i) => enemy(w, 250 + Math.cos(i) * 40, Math.sin(i) * 40))
  step(w, 0.2)
  const zone = w.zones[0]
  step(w, 0.5)
  const chilled = crowd.filter((e) => e.effects.some((f) => f.condition === 'chilled')).length
  step(w, 4.5)
  const dmg = w.weapons[0].damageDealt
  check('Blizzard chills and grinds', !!zone && chilled === 6 && dmg > 6 * 10 * 3.5, `${chilled}/6 chilled, ${dmg.toFixed(0)} damage over its life`)
}
// Thunderstorm: damage arrives as a series of strikes over time.
{
  const w = world('spell_storm_01')
  for (let i = 0; i < 12; i++) enemy(w, 250 + Math.cos(i) * 60, Math.sin(i) * 60)
  step(w, 0.5)
  w.weapons[0].cooldownRemaining = 99
  const early = w.weapons[0].damageDealt
  step(w, 1)
  const mid = w.weapons[0].damageDealt
  step(w, 3.5)
  const late = w.weapons[0].damageDealt
  check('Thunderstorm keeps striking', mid > early && late > mid * 2, `damage at 0.5s ${early.toFixed(0)}, 1.5s ${mid.toFixed(0)}, 5s ${late.toFixed(0)}`)
}
// Gathering Storm: more strikes from the same storm.
{
  const strikes = (upgraded: boolean) => {
    const w = world('spell_storm_01')
    if (upgraded) w.modifiers.push(...UPGRADE_DEFS.find((u) => u.id === 'up_strike_01')!.modifiers)
    for (let i = 0; i < 12; i++) enemy(w, 250 + Math.cos(i) * 60, Math.sin(i) * 60)
    step(w, 0.05)
    w.weapons[0].cooldownRemaining = 99
    let rings = 0
    for (let i = 0; i < 300; i++) { const before = w.vfx.length; step(w, DT); if (w.vfx.length > before) rings++ }
    return w.weapons[0].damageDealt
  }
  const [base, more] = [strikes(false), strikes(true)]
  check('Gathering Storm strikes more often', more > base * 1.15, `damage over a storm ${base.toFixed(0)} -> ${more.toFixed(0)}`)
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
