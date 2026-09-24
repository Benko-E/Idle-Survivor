// Plays each spell against a fixed cluster of enemies and checks it does its
// specific thing, through the real simulation code.
import { ENEMY_DEFS } from '@game/data/enemies'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { updateEnemies } from '@game/sim/enemyMovement'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
// Shelved spells are switched off in the data, but their mechanics are
// still in the code for later; switch everything on to test them.
for (const def of WEAPON_DEFS) def.enabled = true
let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`)
  if (!ok) failures++
}

let nextId = 1
function setup(spellIds: string[], cluster = { x: 160, y: 0, n: 8 }, hp = 1e6): { world: World; enemies: Enemy[] } {
  const world = createWorld(1)
  world.weapons = spellIds.map((id) => ({ def: WEAPON_DEFS.find((d) => d.id === id)!, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }))
  const enemies: Enemy[] = []
  for (let i = 0; i < cluster.n; i++) {
    const a = (i / cluster.n) * Math.PI * 2
    const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x: cluster.x + Math.cos(a) * 25, y: cluster.y + Math.sin(a) * 25, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
    enemies.push(e)
    world.enemies.push(e)
  }
  return { world, enemies }
}
function step(world: World, seconds: number, move = false): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    updateEnemies(world, move ? DT : 0)
    updateCombat(world, DT)
  }
}
const spread = (enemies: Enemy[], cx: number, cy: number) => enemies.reduce((s, e) => s + Math.hypot(e.x - cx, e.y - cy), 0) / enemies.length

// Frostbolt chills what it hits.
{
  const { world, enemies } = setup(['spell_frostbolt_01'], { x: 150, y: 0, n: 1 })
  step(world, 1)
  const chill = enemies[0].effects.find((f) => f.condition === 'chilled')
  check('Frostbolt chills', !!chill && enemies[0].hp < enemies[0].maxHp, `slow ${chill?.magnitude}, dmg ${world.weapons[0].damageDealt.toFixed(0)}`)
}
// Righteous Fire burns everything close, and nothing far.
{
  const { world, enemies } = setup(['spell_aura_01'], { x: 60, y: 0, n: 6 })
  const far: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x: 400, y: 0, hp: 1e6, maxHp: 1e6, speed: 0, effects: [], stride: 0 }
  world.enemies.push(far)
  step(world, 3)
  const burned = enemies.filter((e) => e.hp < e.maxHp).length
  check('Righteous Fire', burned === 6 && far.hp === far.maxHp, `${burned}/6 near burned, far untouched: ${far.hp === far.maxHp}, dmg ${world.weapons[0].damageDealt.toFixed(0)} in 3s`)
}
// Thunderstorm is a storm over a crowd now; see newSpellTest.ts.
// Meteor: waits its full delay, then hits the crowd hard.
{
  const { world, enemies } = setup(['spell_meteor_01'], { x: 200, y: 0, n: 8 })
  step(world, 1.0)
  const before = world.weapons[0].damageDealt
  step(world, 0.2)
  const hit = enemies.filter((e) => e.hp < e.maxHp).length
  check('Meteor', before === 0 && hit === 8, `dmg at 1.0s ${before}, then ${hit}/8 hit for ${world.weapons[0].damageDealt.toFixed(0)}`)
}
// Vortex pulls the crowd together.
{
  const { world, enemies } = setup(['spell_vortex_01'], { x: 200, y: 0, n: 10 })
  // Spread them out wider first so there's something to pull.
  enemies.forEach((e, i) => { const a = (i / 10) * Math.PI * 2; e.x = 200 + Math.cos(a) * 100; e.y = Math.sin(a) * 100 })
  step(world, 0.2)
  const zone = world.zones[0]
  const inReach = enemies.filter((e) => Math.hypot(e.x - zone.x, e.y - zone.y) <= zone.radius)
  const before = spread(inReach, zone.x, zone.y)
  step(world, 1.5)
  const after = spread(inReach, zone.x, zone.y)
  check('Vortex pulls', after < before * 0.6 && world.weapons[0].damageDealt > 0, `${inReach.length} in reach, avg distance to centre ${before.toFixed(0)} -> ${after.toFixed(0)}, dmg ${world.weapons[0].damageDealt.toFixed(0)}`)
}
// Roots hold walking enemies still.
{
  const { world, enemies } = setup(['spell_roots_01'], { x: 250, y: 0, n: 8 })
  enemies.forEach((e) => (e.speed = 46))
  step(world, 0.3, true)
  const rooted = enemies.filter((e) => e.effects.some((f) => f.condition === 'rooted'))
  const positions = rooted.map((e) => [e.x, e.y])
  step(world, 1.0, true)
  const stayed = rooted.filter((e, i) => Math.hypot(e.x - positions[i][0], e.y - positions[i][1]) < 3).length
  check('Entangling Roots', rooted.length >= 6 && stayed === rooted.length, `${rooted.length}/8 rooted, ${stayed} held still for 1s while trying to walk`)
}
// Different spells' damage over time stacks.
{
  const { world, enemies } = setup(['spell_aura_01', 'spell_curse_01'], { x: 60, y: 0, n: 1 })
  step(world, 2)
  const dots = enemies[0].effects.filter((f) => f.def.effect === 'damage').length
  check('DoTs from two spells stack', dots === 2 && world.weapons.every((w) => w.damageDealt > 0), `${dots} burns on one enemy, both spells credited`)
}
// Switched off: never casts.
{
  const { world } = setup(['spell_meteor_01'], { x: 200, y: 0, n: 8 })
  world.weapons[0].def.enabled = false
  step(world, 3)
  const cast = world.weapons[0].timesCast
  world.weapons[0].def.enabled = true
  check('Disabled spell is silent', cast === 0 && world.zones.length === 0, `casts while disabled: ${cast}`)
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
