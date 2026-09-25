// Firewall and its kit, through the real sim: where the wall goes, that what
// walks through it burns, and that every upgrade does what its card says.
import { config } from '@game/config'
import { DEFAULT_CLASS } from '@game/data/classes'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { updateCombat } from '@game/sim/combat'
import { damageEnemy } from '@game/sim/damageEnemy'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { updateEnemies } from '@game/sim/enemyMovement'
import { engagementAt, engagementShapes } from '@game/sim/engagement'
import { spawnPlainBolt, updateProjectiles } from '@game/sim/projectiles'
import { spellsOfTier } from '@game/sim/spellTiers'
import { crossesWall, touchesWall } from '@game/sim/walls'
import { createWorld, type Enemy, type World } from '@game/sim/world'
import type { Zone } from '@game/sim/zones'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${detail}`)
  if (!ok) failures++
}
const wallDef = WEAPON_DEFS.find((def) => def.id === 'spell_wall_01')!
const up = (id: string) => UPGRADE_DEFS.find((def) => def.id === id)!

/** Firewall alone, or alongside his starting bolt when `withBolt` names one. */
function withWall(ups: string[] = [], withBolt?: string): World {
  const w = createWorld(1, withBolt ?? 'spell_bolt_01')
  if (!withBolt) w.weapons = []
  w.weapons.push({ def: wallDef, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 })
  for (const id of ups) applyUpgrade(w, up(id))
  w.level = 20
  return w
}
const wallSpell = (w: World) => w.weapons.find((x) => x.def.id === 'spell_wall_01')!
const walls = (w: World) => w.zones.filter((z) => z.wall)
let nextId = 1
function enemy(w: World, x: number, y: number, hp = 1e9, speed = 0, def = ENEMY_DEFS[0]): Enemy {
  const e: Enemy = { id: nextId++, def, x, y, hp, maxHp: hp, speed, effects: [], stride: 0 }
  w.enemies.push(e)
  return e
}
/** Eight in a tight ring round a point, like a crowd. */
function pack(w: World, cx: number, cy: number, speed = 0): Enemy[] {
  const out: Enemy[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    out.push(enemy(w, cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, 1e9, speed))
  }
  return out
}
function step(w: World, seconds: number, move = false): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.time += DT
    updateEnemies(w, move ? DT : 0)
    updateCombat(w, DT)
  }
}
/** Casts it now: ready, grid fresh, one step. */
function cast(w: World): void {
  wallSpell(w).cooldownRemaining = 0
  rebuildEnemyGrid(w)
  step(w, DT)
}

// Tier 3, in Meteor's place for now.
{
  const names = spellsOfTier(DEFAULT_CLASS, 3).map((d) => d.displayName)
  check('Tier 3 offers Firewall, not Meteor', names.includes('Firewall') && !names.includes('Meteor'), names.join(', '))
  check('...a fire spell', wallDef.tags.includes('fire') && wallDef.tier === 3)
}

// Where it goes: across the crowd's path, a little in front of it.
{
  const w = withWall()
  const crowd = pack(w, 220, 0)
  cast(w)
  const [zone] = walls(w)
  const front = 220 - 25
  check('Casts one wall at a crowd', walls(w).length === 1)
  check('...a little in front of the crowd', Math.abs(zone.x - (front - config.wall.lead)) < 3 && Math.abs(zone.y) < 3, `at ${zone.x.toFixed(0)},${zone.y.toFixed(0)}, crowd front ${front}`)
  check('...lying across its path', Math.abs(zone.wall!.dirX) < 0.05 && Math.abs(Math.abs(zone.wall!.dirY) - 1) < 0.05)
  check('...so every one of them must cross it to reach him', crowd.every((e) => crossesWall(zone, e.x, e.y, w.character.x, w.character.y)))
  check('...and the spell goes on its cooldown', Math.abs(wallSpell(w).cooldownRemaining - 15) < 0.1, `${wallSpell(w).cooldownRemaining.toFixed(1)}s`)
}

// Not worth a wall for a couple of stragglers: it waits, ready.
{
  const w = withWall()
  enemy(w, 200, 0)
  enemy(w, 210, 10)
  cast(w)
  check('No wall for a couple of stragglers', walls(w).length === 0 && wallSpell(w).cooldownRemaining <= config.combat.retrySeconds + 1e-9)
}

// What walks through it burns; what goes round the end doesn't; he doesn't.
{
  const w = withWall()
  const crowd = pack(w, 220, 0, 40)
  const aside = enemy(w, 220, 300, 1e9, 40)
  cast(w)
  step(w, 4, true)
  const burned = crowd.filter((e) => e.hp < e.maxHp)
  const least = Math.min(...crowd.map((e) => e.maxHp - e.hp))
  check('Everything that walks through burns', burned.length === crowd.length, `${burned.length}/8, least ${least.toFixed(0)} damage`)
  check('...for a real bite, not a lick', least >= 15, `least ${least.toFixed(1)}`)
  check('...what goes past its end does not', aside.hp === aside.maxHp)
  check('...and Firewall is credited', Math.abs(wallSpell(w).damageDealt - crowd.reduce((s, e) => s + e.maxHp - e.hp, 0)) < 1e-3)
  check('It never burns him', w.character.hp === w.character.maxHp)
}
{
  const w = withWall()
  pack(w, 220, 0)
  cast(w)
  const [zone] = walls(w)
  const bat = enemy(w, zone.x, zone.y, 1e9, 0, ENEMY_DEFS.find((d) => d.flying)!)
  step(w, 0.5)
  check('Fliers burn too', bat.hp < bat.maxHp, `${(bat.maxHp - bat.hp).toFixed(1)} damage`)
}

// Only three at once: a fourth puts out the oldest.
{
  const w = withWall()
  pack(w, 220, 0)
  const born: number[] = []
  for (let i = 0; i < 4; i++) {
    cast(w)
    born.push(w.time)
    step(w, 0.5)
  }
  const up = walls(w)
  check('Only three walls stand at once', up.length === 3, `${up.length}`)
  check('...the first one went out', !up.some((z) => z.wall!.bornAt < born[1] - DT * 1.5))
}

// It burns out after its duration.
{
  const w = withWall()
  pack(w, 220, 0)
  cast(w)
  step(w, 5.5)
  const still = walls(w).length
  step(w, 1)
  check('Burns out after 6 seconds', still === 1 && walls(w).length === 0)
}

// Hot Coals: what came through keeps burning after it's out of the fire.
{
  const run = (ups: string[]) => {
    const w = withWall(ups)
    pack(w, 220, 0)
    cast(w)
    const [zone] = walls(w)
    const e = enemy(w, zone.x, zone.y)
    step(w, 0.5)
    e.x = zone.x - 120
    step(w, 0.1)
    const out = e.hp
    step(w, 1)
    const burn = e.effects.find((f) => f.condition === 'burning')
    return { hurt: out - e.hp, burning: burn?.source === wallSpell(w) }
  }
  const plain = run([])
  const coals = run(['up_fw_coals'])
  check('Without Hot Coals, out of the fire is out', plain.hurt === 0 && !plain.burning)
  check('Hot Coals: still burning after it walks out', coals.hurt > 0 && coals.burning, `${coals.hurt.toFixed(1)} a second after`)
}

// Wall of Embers: it spits at what's near but not in it.
{
  const run = (ups: string[]) => {
    const w = withWall(ups)
    pack(w, 220, 0)
    cast(w)
    let embers = 0
    let unfired = true
    for (let i = 0; i < 120; i++) {
      step(w, DT)
      for (const p of w.projectiles) {
        if (p.source !== wallSpell(w)) continue
        embers++
        unfired &&= p.kilned === true && !p.kilnBurn
      }
    }
    return { damage: wallSpell(w).damageDealt, embers, unfired }
  }
  const plain = run([])
  const spit = run(['up_fw_embers'])
  check('A crowd standing off the wall: no damage', plain.damage === 0)
  check('Wall of Embers: it spits at them', spit.damage > 0 && spit.embers > 0, `${spit.damage.toFixed(0)} damage in 2s`)
  check('...and embers never count for Kiln', spit.unfired)
}

// Kiln: his bolts come out of it hotter and leave burns — any bolt, once.
{
  const through = (starter: string, ups: string[]) => {
    const w = withWall(ups, starter)
    const bolt = w.weapons[0]
    const base = bolt.def.stats.damage
    const crowd = pack(w, 220, 0)
    bolt.cooldownRemaining = 99
    cast(w)
    bolt.cooldownRemaining = 0
    let boosted = false
    for (let i = 0; i < 90; i++) {
      step(w, DT)
      boosted ||= w.projectiles.some((p) => p.source === bolt && p.kilnBurn === wallSpell(w) && Math.abs(p.damage - base * 1.5) < 1e-6)
    }
    const burnt = crowd.some((e) => e.effects.some((f) => f.condition === 'burning' && f.source === wallSpell(w)))
    return { boosted, burnt }
  }
  const plain = through('spell_bolt_01', [])
  const fire = through('spell_bolt_01', ['up_fw_kiln'])
  const frost = through('spell_frostbolt_01', ['up_fw_kiln'])
  check('Without Kiln, a bolt goes through unchanged', !plain.boosted && !plain.burnt)
  check('Kiln: a Firebolt comes out 50% stronger', fire.boosted)
  check('...and leaves its target burning, from Firewall', fire.burnt)
  check('...a Frostbolt too', frost.boosted && frost.burnt)
}
{
  // Two walls in a row, one plain bolt through both: fired up once.
  const w = withWall(['up_fw_kiln'], 'spell_bolt_01')
  pack(w, 220, 0)
  cast(w)
  const [first] = walls(w)
  w.zones.push({ ...first, x: first.x - 80, wall: { ...first.wall!, bornAt: first.wall!.bornAt + 0.1 } } as Zone)
  w.enemies = []
  rebuildEnemyGrid(w)
  const bolt = spawnPlainBolt(w, w.weapons[0], 0, 0, 0, 10, 400)
  for (let i = 0; i < 60; i++) updateProjectiles(w, DT)
  check('Through two walls, fired up only once', bolt.kilned === true && Math.abs(bolt.damage - 15) < 1e-9, `damage 10 -> ${bolt.damage}`)
}

// Hungry Flames: kills in the fire keep it burning, up to its full duration.
{
  const w = withWall(['up_fw_hungry'])
  pack(w, 220, 0)
  cast(w)
  const [zone] = walls(w)
  step(w, 3)
  const before = zone.remaining
  const prey = enemy(w, zone.x, zone.y, 0.01)
  step(w, DT)
  check('Hungry Flames: a kill in the fire adds a second', prey.hp <= 0 && Math.abs(zone.remaining - (before - DT + 1)) < 0.02, `${before.toFixed(2)} -> ${zone.remaining.toFixed(2)}`)
  const far = enemy(w, -400, 0, 0.01)
  const was = zone.remaining
  damageEnemy(w, far, 1, null)
  check('...a kill somewhere else does not', zone.remaining === was)
  for (let i = 0; i < 8; i++) damageEnemy(w, enemy(w, zone.x, zone.y, 0.01), 1, null)
  check('...and never past its full duration', zone.remaining <= zone.durationTotal + 1e-9, `${zone.remaining.toFixed(2)} of ${zone.durationTotal}`)
}
{
  const w = withWall()
  pack(w, 220, 0)
  cast(w)
  const [zone] = walls(w)
  step(w, 3)
  const before = zone.remaining
  enemy(w, zone.x, zone.y, 0.01)
  step(w, DT)
  check('Without Hungry Flames, kills add nothing', zone.remaining < before)
}

// Kiting Lane: from just behind him out through the crowd chasing him, the
// way they'll run to reach him — so they run its length, not across it.
{
  const w = withWall(['up_fw_lane'])
  w.character.facingX = 1
  w.character.facingY = 0
  const chasers = [-110, -140, -170, -200, -230, -260].map((x, i) => enemy(w, x, i % 2 ? 6 : -6))
  cast(w)
  const [zone] = walls(w)
  const out = config.wall.laneGap + wallDef.stats.area / 2
  check('Kiting Lane: the wall runs the way they chase him', !!zone && Math.abs(zone.wall!.dirY) < 0.05 && Math.abs(zone.wall!.dirX) > 0.95)
  check('...from just behind him out through them', !!zone && Math.abs(zone.x + out) < 3 && Math.abs(zone.y) < 3, zone ? `centre ${zone.x.toFixed(0)},${zone.y.toFixed(0)}` : '')
  check('...with the chasers standing in it', !!zone && chasers.every((e) => touchesWall(zone, e.x, e.y, 0)))
  check('...so none of them has to cross it', !!zone && chasers.every((e) => !crossesWall(zone, e.x, e.y, w.character.x, w.character.y)))
}
{
  const w = withWall(['up_fw_lane'])
  for (const y of [110, 140, 170, 200, 230, 260]) enemy(w, 0, y)
  cast(w)
  const [zone] = walls(w)
  check('...whichever side of him they come from', !!zone && Math.abs(zone.wall!.dirX) < 0.05 && zone.y > 0)
}

// Wall Dancer: base Firewall leaves his movement alone; the upgrade makes
// the far side of his walls the place to be.
{
  const score = (ups: string[]) => {
    const w = withWall(ups)
    pack(w, 220, 0)
    cast(w)
    const shapes = engagementShapes(w)
    const at = (x: number, y: number) => engagementAt(w, shapes, x, y, 1, 0)
    return { shapes: shapes.map((s) => s.kind), behind: at(100, 0), past: at(290, 0), aside: at(100, 260) }
  }
  const plain = score([])
  const dancer = score(['up_fw_dancer'])
  check('Base Firewall: no pull on his movement', !plain.shapes.includes('wall'))
  check('Wall Dancer: wants the wall between him and them', dancer.shapes.includes('wall') && dancer.behind > 5, `behind ${dancer.behind.toFixed(2)}`)
  check('...not out past the crowd', dancer.past < dancer.behind * 0.2, `past ${dancer.past.toFixed(2)}`)
  check('...nor off round its end', dancer.aside < dancer.behind * 0.5, `aside ${dancer.aside.toFixed(2)}`)
}

// Burning Ring: closed round the crowd; the ring burns, not the inside.
{
  const w = withWall(['up_fw_ring'])
  pack(w, 220, 0)
  cast(w)
  const [zone] = walls(w)
  const radius = wallDef.stats.area * config.wall.ringRadius
  check('Burning Ring: a ring round the crowd', zone.wall!.kind === 'ring' && Math.hypot(zone.x - 220, zone.y) < 3 && Math.abs(zone.radius - radius) < 1e-9, `r ${zone.radius}`)
  const middle = enemy(w, 220, 0)
  const edge = enemy(w, 220 + radius, 0)
  step(w, 1)
  check('...the ring burns', edge.hp < edge.maxHp)
  check('...the middle of it does not', middle.hp === middle.maxHp)
  check('...and crossing it counts as through', crossesWall(zone, 220, 0, 0, 0) && !crossesWall(zone, 220, 0, 230, 10))
  check('Burning Ring retires Kiting Lane', !upgradeIsEligible(w, up('up_fw_lane')))
  check('...and rules out Creeping Blaze', !upgradeIsEligible(w, up('up_fw_creep')))
}

// Creeping Blaze: it creeps towards them and grows as it goes.
{
  const w = withWall(['up_fw_creep'])
  pack(w, 400, 0)
  cast(w)
  const [zone] = walls(w)
  const x0 = zone.x
  const half0 = zone.wall!.halfLength
  step(w, 2)
  const moved = zone.x - x0
  check('Creeping Blaze: creeps towards the crowd', Math.abs(moved - 2 * config.wall.creepSpeed) < 1, `${moved.toFixed(1)} units in 2s`)
  check('...growing longer as it goes', Math.abs(zone.wall!.halfLength - half0 * (1 + 2 * config.wall.creepGrowth)) < 1, `${(half0 * 2).toFixed(0)} -> ${(zone.wall!.halfLength * 2).toFixed(0)}`)
  step(w, 3)
  check('...up to double', zone.wall!.halfLength <= half0 * (1 + config.wall.creepMaxGrowth) + 1e-9)
}
{
  const w = withWall()
  pack(w, 400, 0)
  cast(w)
  const [zone] = walls(w)
  const x0 = zone.x
  step(w, 2)
  check('Without it, the wall stays put', zone.x === x0)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
