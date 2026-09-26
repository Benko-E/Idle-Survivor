// Companions and casters, through the real sim: a companion follows, fights
// and roams on its leash and casts its own spells from where it stands; and a
// spell cast by an enemy flies at him instead.
import { COMPANION_DEFS } from '@game/data/companions'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import type { CompanionDef } from '@game/data/types'
import { castReadySpells, updateCombat } from '@game/sim/combat'
import { dismissCompanion, summonCompanion, updateCompanions } from '@game/sim/companions'
import { applyUpgrade } from '@game/sim/draft'
import { updateEnemies } from '@game/sim/enemyMovement'
import { orbitPositions } from '@game/sim/orbit'
import { spawnPlainBolt, updateProjectiles } from '@game/sim/projectiles'
import { createWorld, type Caster, type Enemy, type WeaponInstance, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}
const elemental = COMPANION_DEFS[0]
const spell = (id: string) => WEAPON_DEFS.find((def) => def.id === id)!
/** A world with nothing of his own casting, so whatever happens is the companion's doing. */
function quiet(): World {
  const w = createWorld(1)
  w.weapons = []
  return w
}
let nextId = 1
function enemy(w: World, x: number, y: number, hp = 1e9, speed = 0): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed, effects: [], stride: 0 }
  w.enemies.push(e)
  return e
}
function step(w: World, seconds: number, move = false): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.time += DT
    updateEnemies(w, move ? DT : 0)
    updateCompanions(w, DT)
    updateCombat(w, DT)
  }
}
const toHim = (w: World, c: { x: number; y: number }) => Math.hypot(c.x - w.character.x, c.y - w.character.y)

// Summoned at his side, with spells of its own that aren't his.
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  check('Summoned beside him', w.companions.length === 1 && toHim(w, pet) < 50, `${toHim(w, pet).toFixed(0)} away`)
  check('...its spells cast by it', pet.weapons.length === 1 && pet.weapons[0].caster === pet)
  check('...and not his (no spell bar, no upgrade cards)', w.weapons.length === 0)
}

// Nothing to fight, him standing still: it wanders about, never off its leash.
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  let travelled = 0
  let furthest = 0
  for (let i = 0; i < 60 * 12; i++) {
    const x = pet.x
    const y = pet.y
    step(w, DT)
    travelled += Math.hypot(pet.x - x, pet.y - y)
    furthest = Math.max(furthest, toHim(w, pet))
  }
  check('Roams around him when there is nothing to do', pet.mode === 'roam' && travelled > 100, `${travelled.toFixed(0)} walked in 12s`)
  check('...never further than its leash', furthest <= elemental.leash, `furthest ${furthest.toFixed(0)} of ${elemental.leash}`)
}

// He walks off: it follows, and keeps up.
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  let furthest = 0
  for (let i = 0; i < 60 * 10; i++) {
    w.character.x += 110 * DT
    step(w, DT)
    furthest = Math.max(furthest, toHim(w, pet))
  }
  check('Follows him when he walks off', toHim(w, pet) <= elemental.leash * 1.2, `${toHim(w, pet).toFixed(0)} behind after 10s`)
  check('...never falling far behind', furthest < elemental.leash * 2, `furthest ${furthest.toFixed(0)}`)
  w.character.x += 400
  step(w, DT)
  check('...heading back when he gets away', pet.mode === 'follow')
  w.character.x += 3000
  step(w, DT)
  check('...and reappearing beside him if it gets lost', toHim(w, pet) < 50, `${toHim(w, pet).toFixed(0)} away`)
}

// An enemy near him: it closes to its distance and casts its bolt from there.
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  const foe = enemy(w, 250, 0)
  let firedFrom: { x: number; y: number; atX: number; atY: number } | null = null
  for (let i = 0; i < 60 * 3; i++) {
    const before = w.projectiles.length
    step(w, DT)
    if (!firedFrom && w.projectiles.length > before) {
      const bolt = w.projectiles[w.projectiles.length - 1]
      firedFrom = { x: bolt.x - bolt.vx * DT, y: bolt.y - bolt.vy * DT, atX: pet.x, atY: pet.y }
    }
  }
  const gap = Math.hypot(pet.x - foe.x, pet.y - foe.y)
  check('Fights an enemy near him', pet.mode === 'fight' && Math.abs(gap - elemental.engageDistance) < elemental.engageDistance * 0.3, `${gap.toFixed(0)} from it`)
  check('...casting from where it stands, not from him', !!firedFrom && Math.hypot(firedFrom.x - firedFrom.atX, firedFrom.y - firedFrom.atY) < 8 && toHim(w, firedFrom) > 20,
    firedFrom ? `bolt left ${Math.hypot(firedFrom.x - firedFrom.atX, firedFrom.y - firedFrom.atY).toFixed(1)} from it` : 'nothing fired')
  check('...its damage credited to its own spell', foe.hp < foe.maxHp && Math.abs(pet.weapons[0].damageDealt - (foe.maxHp - foe.hp)) < 1e-6, `${pet.weapons[0].damageDealt.toFixed(0)} dealt`)
  const kills = w.kills
  const prey = enemy(w, pet.x + 60, pet.y, 1)
  step(w, 2)
  check('...and its kills count as his', prey.hp <= 0 && w.kills > kills)
}
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  enemy(w, elemental.reach - 10, 0)
  step(w, 3)
  check('...without leaving its leash to chase', toHim(w, pet) <= elemental.leash + 1, `${toHim(w, pet).toFixed(0)} from him`)
  const chaser = enemy(w, 0, 300, 1e9, 60)
  w.enemies = [chaser]
  const pet2 = summonCompanion(w, { ...elemental, id: 'test', spells: [] })
  pet2.x = 0
  pet2.y = 250
  const start = Math.hypot(chaser.x, chaser.y)
  step(w, 1, true)
  check('Enemies ignore it and go for him', Math.hypot(chaser.x, chaser.y) < start - 40)
  dismissCompanion(w, pet2)
  check('Dismissed, it is gone', !w.companions.includes(pet2) && w.companions.includes(pet))
}

// Any spell casts from its caster: an aura, a zone and an orbit on a
// companion all happen round the companion.
{
  const def: CompanionDef = { ...elemental, id: 'test_caster', spells: ['spell_aura_01', 'spell_blizzard_01', 'spell_ball_01'] }
  const w = quiet()
  const pet = summonCompanion(w, def)
  pet.x = 600
  pet.y = 0
  const nearIt = enemy(w, 640, 0)
  const nearHim = enemy(w, 40, 0)
  for (let i = 0; i < 90; i++) {
    w.time += DT
    updateEnemies(w, 0)
    updateCombat(w, DT)
  }
  check('An aura on it burns round it, not round him', nearIt.hp < nearIt.maxHp && nearHim.hp === nearHim.maxHp)
  check('A zone it casts lands near it', w.zones.length > 0 && w.zones.every((z) => Math.hypot(z.x - 600, z.y) < 200), w.zones.map((z) => `${z.x.toFixed(0)},${z.y.toFixed(0)}`).join(' '))
  const orbs = orbitPositions(w, pet.weapons[2])
  check('Orbiting spells circle it', orbs.every((o) => Math.abs(Math.hypot(o.x - 600, o.y) - spell('spell_ball_01').stats.area) < 1e-6))
}

// A bolt that turns back flies home to whoever threw it.
{
  const w = quiet()
  const pet = summonCompanion(w, elemental)
  pet.x = 300
  pet.y = 300
  const bolt = spawnPlainBolt(w, pet.weapons[0], 500, 300, 0, 5, 400)
  bolt.returning = true
  bolt.mutations = { fork: 0, forkEveryHit: false, returns: 0, explode: 0, ignite: 0, combust: false, trail: 0 }
  updateProjectiles(w, DT)
  check('A returning bolt flies home to its caster', bolt.vx < 0 && Math.abs(bolt.vy) < 1e-6, `heading ${bolt.vx.toFixed(0)},${bolt.vy.toFixed(0)}`)
}

// An enemy casting: the same spells, aimed at him, none of his upgrades.
{
  const w = quiet()
  applyUpgrade(w, UPGRADE_DEFS.find((u) => u.id === 'up_fire_01')!)
  const boss: Caster = { x: 250, y: 0, facingX: -1, facingY: 0, side: 'enemy' }
  const bolt = spell('spell_elemental_bolt_01')
  const weapon: WeaponInstance = { def: bolt, caster: boss, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }
  const between = enemy(w, 120, 0)
  castReadySpells(w, [weapon], DT)
  const thrown = w.projectiles[0]
  check('An enemy caster throws its bolt at him', !!thrown && thrown.side === 'enemy' && thrown.vx < 0, thrown ? `${thrown.vx.toFixed(0)},${thrown.vy.toFixed(0)}` : 'nothing')
  check('...without his upgrades on it', !!thrown && thrown.damage === bolt.stats.damage, thrown ? `${thrown.damage}` : '')
  const hp = w.character.hp
  for (let i = 0; i < 60 && w.projectiles.length > 0; i++) updateProjectiles(w, DT)
  check('...it hurts him', w.character.hp < hp && (w.damageTakenBy[bolt.displayName] ?? 0) > 0, `${(hp - w.character.hp).toFixed(1)} damage`)
  check('...and flies through the enemies in the way', between.hp === between.maxHp)
  const aura: WeaponInstance = { def: spell('spell_aura_01'), caster: boss, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }
  castReadySpells(w, [aura], DT)
  check('Spells enemies cannot cast yet are skipped', aura.cooldownRemaining === Number.POSITIVE_INFINITY && aura.timesCast === 0)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
