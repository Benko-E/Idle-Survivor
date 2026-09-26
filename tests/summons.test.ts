// Summons and casters, through the real sim: a companion follows, fights and
// roams on its leash and casts its own spells from where it stands; other
// summons stay put, drift, seek, circle or slither, burn out, and hurt along
// their bodies; and a spell cast by an enemy flies at him instead.
import { ENEMY_DEFS } from '@game/data/enemies'
import { SUMMON_DEFS } from '@game/data/summons'
import type { SummonDef } from '@game/data/types'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { auraRadius } from '@game/sim/auras'
import { castReadySpells, updateCombat } from '@game/sim/combat'
import { applyUpgrade } from '@game/sim/draft'
import { updateEnemies } from '@game/sim/enemyMovement'
import { orbitPositions } from '@game/sim/orbit'
import { spawnPlainBolt, updateProjectiles } from '@game/sim/projectiles'
import { dismiss, summon, updateSummons } from '@game/sim/summons'
import { createWorld, type Caster, type Enemy, type WeaponInstance, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${detail}`)
  if (!ok) failures++
}
const summonDef = (id: string) => SUMMON_DEFS.find((def) => def.id === id)!
const elemental = summonDef('summon_fire_elemental_01')
const spell = (id: string) => WEAPON_DEFS.find((def) => def.id === id)!
/** A world with nothing of his own casting, so whatever happens is the summon's doing. */
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
    updateSummons(w, DT)
    updateCombat(w, DT)
  }
}
const toHim = (w: World, c: { x: number; y: number }) => Math.hypot(c.x - w.character.x, c.y - w.character.y)

// --- a companion (leash) ---------------------------------------------------------

// Summoned at his side, with spells of its own that aren't his.
{
  const w = quiet()
  const pet = summon(w, elemental)
  check('A companion is summoned beside him', w.summons.length === 1 && toHim(w, pet) < 50, `${toHim(w, pet).toFixed(0)} away`)
  check('...its spells cast by it', pet.weapons.length === 1 && pet.weapons[0].caster === pet)
  check('...and not his (no spell bar, no upgrade cards)', w.weapons.length === 0)
}

// Nothing to fight, him standing still: it wanders about, never off its leash.
{
  const w = quiet()
  const pet = summon(w, elemental)
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
  const pet = summon(w, elemental)
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
// Summoned off to his side, so where it casts from can't be mistaken for him.
{
  const w = quiet()
  const pet = summon(w, elemental, { x: 0, y: 100 })
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
  const engage = elemental.engageDistance ?? 0
  check('Fights an enemy near him', pet.mode === 'fight' && Math.abs(gap - engage) < engage * 0.3, `${gap.toFixed(0)} from it`)
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
  const pet = summon(w, elemental)
  enemy(w, elemental.reach - 10, 0)
  step(w, 3)
  check('...without leaving its leash to chase', toHim(w, pet) <= elemental.leash + 1, `${toHim(w, pet).toFixed(0)} from him`)
  const chaser = enemy(w, 0, 300, 1e9, 60)
  w.enemies = [chaser]
  const pet2 = summon(w, { ...elemental, id: 'test', spells: [] })
  pet2.x = 0
  pet2.y = 250
  const start = Math.hypot(chaser.x, chaser.y)
  step(w, 1, true)
  check('Enemies ignore it and go for him', Math.hypot(chaser.x, chaser.y) < start - 40)
  dismiss(w, pet2)
  check('Dismissed, it is gone', !w.summons.includes(pet2) && w.summons.includes(pet))
}

// Any spell casts from its caster: an aura, a zone and an orbit on a summon
// all happen round the summon.
{
  const def: SummonDef = { ...elemental, id: 'test_caster', movement: 'still', spells: ['spell_aura_01', 'spell_blizzard_01', 'spell_ball_01'] }
  const w = quiet()
  const pet = summon(w, def, { x: 600, y: 0 })
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
  const pet = summon(w, elemental, { x: 300, y: 300 })
  const bolt = spawnPlainBolt(w, pet.weapons[0], 500, 300, 0, 5, 400)
  bolt.returning = true
  bolt.mutations = { fork: 0, forkEveryHit: false, returns: 0, explode: 0, ignite: 0, combust: false, trail: 0 }
  updateProjectiles(w, DT)
  check('A returning bolt flies home to its caster', bolt.vx < 0 && Math.abs(bolt.vy) < 1e-6, `heading ${bolt.vx.toFixed(0)},${bolt.vy.toFixed(0)}`)
}

// --- the other movements ---------------------------------------------------------

// Still, with a lifetime: a Righteous Fire left on the grass stays put while
// he walks off, burns what's round it, and burns out. It's his Righteous
// Fire, so it burns with his upgrades for it.
{
  const w = quiet()
  const ground = summonDef('summon_ground_fire_01')
  const fire = summon(w, ground, { x: 300, y: 0 })
  const near = enemy(w, 330, 0)
  for (let i = 0; i < 60 * 3; i++) {
    w.character.x -= 110 * DT
    step(w, DT)
  }
  check('A fire on the grass stays where it was put', fire.x === 300 && fire.y === 0 && w.summons.includes(fire))
  check('...burns what is round it, credited to it', near.hp < near.maxHp && fire.weapons[0].damageDealt > 0)
  step(w, ground.duration - 3 + 0.1)
  check('...and burns out after its duration', !w.summons.includes(fire), `${ground.duration}s`)
  const w2 = quiet()
  applyUpgrade(w2, UPGRADE_DEFS.find((u) => u.id === 'up_rf_crown')!)
  const crowned = summon(w2, ground, { x: 0, y: 0 })
  const base = spell('spell_aura_01').stats.area
  check('...sharing his Righteous Fire upgrades (Crown of Flames)', Math.abs(auraRadius(w2, crowned.weapons[0]) - base * 0.5) < 1e-9, `${base} -> ${auraRadius(w2, crowned.weapons[0])}`)
}

// Drift: wanders about near him, turning smoothly, and turns back at its leash.
{
  const w = quiet()
  const wander = summonDef('summon_wandering_fire_01')
  const fire = summon(w, wander)
  let travelled = 0
  let furthest = 0
  let sharpest = 0
  for (let i = 0; i < 60 * 20; i++) {
    const x = fire.x
    const y = fire.y
    const heading = fire.heading
    step(w, DT)
    travelled += Math.hypot(fire.x - x, fire.y - y)
    furthest = Math.max(furthest, toHim(w, fire))
    sharpest = Math.max(sharpest, Math.abs(fire.heading - heading))
  }
  check('A drifting fire wanders about', travelled > 400, `${travelled.toFixed(0)} in 20s`)
  check('...near him', furthest < wander.leash * 1.2, `furthest ${furthest.toFixed(0)} of ${wander.leash}`)
  check('...turning smoothly, never snapping round', sharpest <= (wander.turnRate ?? 0) * 2 * DT + 1e-9, `${sharpest.toFixed(3)} rad in a step`)
  w.character.x += 5000
  step(w, DT)
  check('...and it finds its way back if he leaves it far behind', toHim(w, fire) < 50)
}

// Seek: to the biggest crowd near him, circling over it.
{
  const def: SummonDef = { ...elemental, id: 'test_seek', movement: 'seek', speed: 80, turnRate: 3, leash: 300, reach: 320, spells: [] }
  const w = quiet()
  for (let i = 0; i < 8; i++) enemy(w, 200 + (i % 3) * 12, 100 + Math.floor(i / 3) * 12)
  enemy(w, -250, 0)
  const seeker = summon(w, def)
  step(w, 6)
  const off = Math.hypot(seeker.x - 212, seeker.y - 112)
  check('Seek: it goes to the biggest crowd near him', off < 70, `${off.toFixed(0)} from it`)
}

// Circle: round him, at its distance.
{
  const def: SummonDef = { ...elemental, id: 'test_circle', movement: 'circle', speed: 120, orbitRadius: 90, spells: [] }
  const w = quiet()
  const orbiter = summon(w, def)
  const start = orbiter.orbitAngle
  step(w, 3)
  check('Circle: it goes round him at its distance', Math.abs(toHim(w, orbiter) - 90) < 1e-6 && Math.abs(orbiter.orbitAngle - start - (120 / 90) * 3) < 0.05)
}

// Slither: the serpent weaves its way along, its body trailing behind.
{
  const serpentDef = summonDef('summon_lightning_serpent_01')
  const w = quiet()
  const serpent = summon(w, serpentDef)
  let left = 0
  let right = 0
  for (let i = 0; i < 60 * 4; i++) {
    step(w, DT)
    const facing = Math.atan2(serpent.facingY, serpent.facingX)
    const across = Math.atan2(Math.sin(facing - serpent.heading), Math.cos(facing - serpent.heading))
    if (across > 0.3) left++
    if (across < -0.3) right++
  }
  const body = serpent.body!
  const gaps = body.slice(1).map((point, i) => Math.hypot(point.x - body[i].x, point.y - body[i].y))
  check('The serpent weaves from side to side', left > 20 && right > 20, `${left} steps one way, ${right} the other`)
  check('...its body trailing behind its head',
    body.length === serpentDef.body!.segments + 1 && gaps.every((gap) => gap <= serpentDef.body!.spacing + 1e-9) && body[0].x === serpent.x,
    `${body.length} points, gaps up to ${Math.max(...gaps).toFixed(1)}`)
}

// A body hurts whatever touches it, anywhere along it, not only the head,
// and not sixty times a second.
{
  const def: SummonDef = { ...summonDef('summon_lightning_serpent_01'), id: 'test_body', movement: 'still', body: { segments: 5, spacing: 20 } }
  const w = quiet()
  const serpent = summon(w, def, { x: 200, y: 0 })
  const onTheBody = enemy(w, 150, 0)
  const offIt = enemy(w, 200, 100)
  step(w, 1)
  const coil = spell('spell_serpent_coil_01')
  const hits = (onTheBody.maxHp - onTheBody.hp) / coil.stats.damage
  check('Its body hurts what touches it, away from the head', serpent.body![0].x === 200 && hits >= 1 && offIt.hp === offIt.maxHp, `${hits.toFixed(0)} hits`)
  check('...once every so often, not every step', hits <= Math.ceil(1 / coil.stats.rehit) + 1, `${hits.toFixed(0)} in 1s at ${coil.stats.rehit}s apart`)
}

// --- enemy casters ---------------------------------------------------------------

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
