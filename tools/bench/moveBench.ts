// Movement quality benchmark. Runs several seeds headlessly and reports
// numbers for the things that look wrong on screen:
//   jitter    — how much his heading wobbles back and forth
//   sprite    — how often the 4-way facing row flips (what the eye reads as stutter)
//   skipped   — coins that came within grabbing-ish range and were left behind
//   damage    — hp lost per minute (diving into mobs)
//   gold      — gold earned per minute, survival time
import { config } from '@game/config'
import { updateCombat } from '@game/sim/combat'
import { updateContactDamage } from '@game/sim/damage'
import { currentOffers, takeOffer } from '@game/sim/draft'
import { updateEnemies } from '@game/sim/enemyMovement'
import { resetInfluenceClock, updateInfluence } from '@game/sim/influence'
import { updateCharacterMovement } from '@game/sim/movement'
import { updatePickups } from '@game/sim/pickups'
import { updateShop } from '@game/sim/shop'
import { updateSpawner } from '@game/sim/spawner'
import { updateTrail } from '@game/sim/trail'
import { updateVitals } from '@game/sim/vitals'
import { createWorld, type Pickup } from '@game/sim/world'
import { forEachObstacleNear } from '@game/sim/obstacles'
import { stickyFacingRow } from '@game/render/sprites'

// PATCH='{"movement":{"turnRateRadPerSec":3}}' deep-merges over the live config.
function merge(target: any, patch: any): void {
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) merge(target[k], patch[k])
    else target[k] = patch[k]
  }
}
if (process.env.PATCH) merge(config, JSON.parse(process.env.PATCH))

const DT = 1 / 60
const SECONDS = Number(process.env.SECONDS ?? 180)
const SEEDS = (process.env.SEEDS ?? '1,2,3,4,5,6').split(',').map(Number)

function facingRow(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 1
  return dy > 0 ? 0 : 3
}

interface Result { seed: number; time: number; dead: boolean; wobble: number; turn: number; flips: number; straight: number; skipped: number; skippedNear: number; skippedSafe: number; roam: number; lateRoam: number; stuck: number; inside: number; dmg: number; gold: number; banks: number; ms: number }

function run(seed: number): Result {
  resetInfluenceClock()
  const world = createWorld(seed)
  const hh = config.render.visibleWorldHeight / 2
  const hw = hh * config.render.yScale * 1.8
  const c = world.character

  let prevAngle = Math.atan2(c.facingY, c.facingX)
  let prevRow = facingRow(c.facingX, c.facingY)
  let flips = 0, turnSum = 0, wobbles = 0
  let lastSign = 0, sinceSample = 0, sampleTurn = 0
  let straightSum = 0, straightN = 0, winPath = 0, winX = c.x, winY = c.y, winT = 0
  let hpLost = 0, prevHp = c.hp
  let stuckSeconds = 0, stuckX = c.x, stuckY = c.y, stuckT = 0, insideSamples = 0, enemySamples = 0
  let roamSum = 0, roamN = 0, roamPath = 0, roamX = c.x, roamY = c.y, roamT = 0, lateRoamSum = 0, lateRoamN = 0
  // coin -> closest approach so far; skipped once he's 220+ away and it still exists
  const closest = new Map<Pickup, number>()
  const crowdAtClosest = new Map<Pickup, number>()
  const ctx = new Map<Pickup, string>()
  let skippedSafe = 0
  let skipped = 0, skippedNear = 0
  const t0 = performance.now()

  const steps = Math.round(SECONDS / DT)
  for (let i = 0; i < steps && world.state === 'running'; i++) {
    const px = c.x, py = c.y
    world.time += DT
    updateSpawner(world, DT, hw, hh)
    updateEnemies(world, DT)
    updatePickups(world, DT)
    updateInfluence(world, DT)
    updateCharacterMovement(world, DT)
    updateTrail(world)
    updateShop(world)
    updateCombat(world, DT)
    updateVitals(world, DT)
    updateContactDamage(world, DT)
    if (world.pendingLevelUps > 0) { const o = currentOffers(world); if (o.length) takeOffer(world, o[0]) }

    if (c.hp < prevHp) hpLost += prevHp - c.hp
    prevHp = c.hp

    // heading
    const a = Math.atan2(c.facingY, c.facingX)
    let d = a - prevAngle
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    prevAngle = a
    turnSum += Math.abs(d)
    sampleTurn += d
    sinceSample += DT
    if (sinceSample >= 0.1) {
      // a wobble: turning > 40 deg/s one way, then > 40 deg/s the other
      const deg = (sampleTurn * 180) / Math.PI
      if (Math.abs(deg) > 4) {
        const s = Math.sign(deg)
        if (lastSign !== 0 && s !== lastSign) wobbles++
        lastSign = s
      }
      sinceSample = 0; sampleTurn = 0
    }
    const row = stickyFacingRow(c, c.facingX, c.facingY, config.render.facingSlackDegrees)
    if (row !== prevRow) flips++
    prevRow = row

    // straightness over 1s windows
    winPath += Math.hypot(c.x - px, c.y - py)
    winT += DT
    if (winT >= 1) {
      if (winPath > 1) { straightSum += Math.hypot(c.x - winX, c.y - winY) / winPath; straightN++ }
      winPath = 0; winT = 0; winX = c.x; winY = c.y
    }

    roamPath += Math.hypot(c.x - px, c.y - py); roamT += DT
    if (roamT >= 15) {
      const r = Math.hypot(c.x - roamX, c.y - roamY) / Math.max(roamPath, 1)
      roamSum += r; roamN++
      if (world.time > 90) { lateRoamSum += r; lateRoamN++ }
      roamPath = 0; roamT = 0; roamX = c.x; roamY = c.y
    }

    // stuck: under 25 units of progress in a second
    stuckT += DT
    if (stuckT >= 1) { if (Math.hypot(c.x - stuckX, c.y - stuckY) < 25) stuckSeconds++; stuckT = 0; stuckX = c.x; stuckY = c.y }
    if (i % 60 === 0) {
      for (const e of world.enemies) {
        enemySamples++
        forEachObstacleNear(world, e.x, e.y, 40, (o) => { if (o.radius > 0 && Math.hypot(e.x - o.x, e.y - o.y) < o.radius + e.def.radius - 1) insideSamples++ })
      }
    }

    // skipped coins
    if (i % 6 === 0) {
      const alive = new Set(world.pickups)
      for (const p of world.pickups) {
        const dist = Math.hypot(p.x - c.x, p.y - c.y)
        const best = closest.get(p)
        if (best === undefined || dist < best) {
          closest.set(p, dist)
          let crowd = 0
          for (const e of world.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 70) crowd++
          crowdAtClosest.set(p, crowd)
          const ang = Math.round((Math.acos(Math.max(-1, Math.min(1, ((p.x - c.x) * c.facingX + (p.y - c.y) * c.facingY) / Math.max(dist, 1e-6)))) * 180) / Math.PI)
          let nearestEnemy = Infinity
          for (const e of world.enemies) nearestEnemy = Math.min(nearestEnemy, Math.hypot(e.x - c.x, e.y - c.y))
          ctx.set(p, `t=${world.time.toFixed(1)} dist=${dist.toFixed(0)} angleOffHeading=${ang} tier=${p.tier} intent=${world.intent} gold=${world.gold.toFixed(0)} nearestEnemyToHim=${nearestEnemy.toFixed(0)} hp=${c.hp.toFixed(0)}`)
        }
      }
      for (const [p, best] of closest) {
        if (!alive.has(p)) { closest.delete(p); continue }
        if (best > 70) continue
        if (Math.hypot(p.x - c.x, p.y - c.y) > 220) {
          skipped++
          if (best < 45) skippedNear++
          if ((crowdAtClosest.get(p) ?? 0) === 0) { skippedSafe++; if (process.env.EVENTS) console.log(`  seed ${seed} safe skip: ${ctx.get(p)}`) }
          closest.delete(p)
        }
      }
    }
  }

  if (process.env.DETAIL) {
    const onGround = world.pickups.reduce((sum, p) => sum + p.def.baseGold * Math.pow(config.pickups.merge.goldPerTier, p.tier), 0)
    const near = world.pickups.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) < 600).length
    console.log(`  seed ${seed}: kills ${world.kills}, earned ${world.goldEarned.toFixed(0)}, still on ground ${onGround.toFixed(0)} in ${world.pickups.length} piles (${near} within 600), level ${world.level}, enemies ${world.enemies.length}`)
    console.log(`    spells: ${world.weapons.map((w) => w.def.displayName).join(', ')} | upgrades: ${Object.entries(world.upgradesTaken).map(([k, v]) => k.replace('up_', '').replace('_01', '') + 'x' + v).join(' ')}`)
  }
  const minutes = world.time / 60
  return {
    seed, time: world.time, dead: world.state === 'dead',
    wobble: wobbles / minutes, turn: (turnSum * 180) / Math.PI / world.time, flips: flips / minutes,
    straight: straightSum / Math.max(1, straightN),
    skipped: skipped / minutes, skippedNear: skippedNear / minutes, skippedSafe: skippedSafe / minutes, roam: roamSum / Math.max(1, roamN), stuck: stuckSeconds / minutes, inside: insideSamples / Math.max(1, enemySamples), lateRoam: lateRoamSum / Math.max(1, lateRoamN),
    dmg: hpLost / minutes, gold: world.goldEarned / minutes, banks: world.shopVisits,
    ms: (performance.now() - t0) / world.time,
  }
}

const rows = SEEDS.map(run)
const f = (n: number, d = 1) => n.toFixed(d).padStart(7)
console.log('seed   survived  wobble/m turn°/s flips/m straight skip/m  skipN/m dmg/m  gold/m banks  ms/simsec')
for (const r of rows) {
  console.log(`${String(r.seed).padEnd(5)} ${f(r.time, 0)}${r.dead ? '†' : ' '} ${f(r.wobble)} ${f(r.turn)} ${f(r.flips)} ${f(r.straight, 2)} ${f(r.skipped)} ${f(r.skippedNear)} ${f(r.dmg)} ${f(r.gold)} ${f(r.banks, 0)} ${f(r.ms, 2)}`)
}
const avg = (k: keyof Result) => rows.reduce((s, r) => s + (r[k] as number), 0) / rows.length
console.log(`       stuck ${avg('stuck').toFixed(1)} s/min, enemies inside a trunk ${(avg('inside') * 100).toFixed(2)}% of samples`)
console.log(`       roam efficiency (15s) ${avg('roam').toFixed(2)}, after 1:30 ${avg('lateRoam').toFixed(2)}`)
console.log(`       skipped with no enemy within 70 of the coin: ${avg('skippedSafe').toFixed(1)}/min`)
console.log(`MEAN  ${f(avg('time'), 0)}  ${f(avg('wobble'))} ${f(avg('turn'))} ${f(avg('flips'))} ${f(avg('straight'), 2)} ${f(avg('skipped'))} ${f(avg('skippedNear'))} ${f(avg('dmg'))} ${f(avg('gold'))} ${f(avg('banks'), 1)} ${f(avg('ms'), 2)}`)
