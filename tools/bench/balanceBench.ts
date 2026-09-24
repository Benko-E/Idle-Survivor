// Balance benchmark: full runs with a bot that drafts like a sensible player.
//
//   STARTERS=spell_bolt_01,...   which starting spell(s)
//   SEEDS=1,2,3                  run seeds
//   MAX=1800                     cap in seconds
//   SOLO=1                       never take new spells, only upgrades
//   BOT=smart|random             drafting style
//   PATCH='{...}'                config overrides
//
//   OLDROSTER=1 / ROSTER17=1     only the first 3 / 6 enemies, for before/after
//
// Prints one JSON line per run; tools/bench/run.mjs runs it and summarises.
// Its bot drafts upgrades sensibly but never takes a tier 2 or 3 spell, so
// real runs are easier than these.
import { DEFAULT_CLASS } from '@game/data/classes'
import { config } from '@game/config'
import { makeRng } from '@game/core/rng'
import { updateCombat } from '@game/sim/combat'
import { updateContactDamage } from '@game/sim/damage'
import { currentOffers, takeOffer, type Offer } from '@game/sim/draft'
import { updateEnemies } from '@game/sim/enemyMovement'
import { resetInfluenceClock, updateInfluence } from '@game/sim/influence'
import { updateCharacterMovement } from '@game/sim/movement'
import { updatePickups } from '@game/sim/pickups'
import { updateShop } from '@game/sim/shop'
import { updateSpawner } from '@game/sim/spawner'
import { updateTrail } from '@game/sim/trail'
import { updateVitals } from '@game/sim/vitals'
import { spellsOfTier } from '@game/sim/spellTiers'
import { createWorld, type World } from '@game/sim/world'
import { WEAPON_DEFS } from '@game/data/weapons'
import { ENEMY_DEFS } from '@game/data/enemies'
// OLDROSTER=1: only the original three enemies, for before/after comparisons.
if (process.env.OLDROSTER === '1') ENEMY_DEFS.splice(3)
if (process.env.ROSTER17 === '1') ENEMY_DEFS.splice(6)

function merge(t: any, p: any): void { for (const k of Object.keys(p)) { if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) merge(t[k], p[k]); else t[k] = p[k] } }
if (process.env.PATCH) merge(config, JSON.parse(process.env.PATCH))
if (process.env.SPELLPATCH) {
  const patch = JSON.parse(process.env.SPELLPATCH) as Record<string, Record<string, number | boolean>>
  for (const [id, fields] of Object.entries(patch)) {
    const def = WEAPON_DEFS.find((d) => d.id === id)!
    for (const [k, v] of Object.entries(fields)) { if (k === 'enabled') def.enabled = v as boolean; else def.stats[k] = v as number }
  }
}

const DT = 1 / 60
const MAX = Number(process.env.MAX ?? 1800)
const SOLO = process.env.SOLO === '1'
const BOT = process.env.BOT ?? 'smart'
const STARTERS = (process.env.STARTERS ?? spellsOfTier(DEFAULT_CLASS, 1).map((def) => def.id).join(',')).split(',')
const SEEDS = (process.env.SEEDS ?? '1,2,3').split(',').map(Number)

/**
 * How much a sensible player wants each card. Not optimal play — a stand-in
 * for "picks things that fit the build", with noise so builds differ.
 */
function score(world: World, offer: Offer, noise: number): number {
  const hpFraction = world.character.hp / world.character.maxHp
  const tags = offer.def.tags
  let value = 40
  if (tags.includes('offence')) value = offer.def.requiresOwnedTags ? 75 : 65
  if (tags.includes('defence')) value = 35 + (1 - hpFraction) * 80
  if (tags.includes('utility')) {
    const id = offer.id
    value = id.includes('swift') ? 40 : id.includes('scholar') ? 38 : 20
  }
  return value + noise * 30
}

function pick(world: World, rng: () => number): void {
  const offers = currentOffers(world)
  if (offers.length === 0) return
  let chosen = offers[0]
  if (BOT === 'random') chosen = offers[Math.floor(rng() * offers.length)]
  else {
    let best = -Infinity
    for (const offer of offers) {
      const s = score(world, offer, rng())
      if (s > best) { best = s; chosen = offer }
    }
    if (best < 0) return // solo: nothing acceptable offered, leave the level unspent
  }
  takeOffer(world, chosen)
}

function diffTaken(before: Record<string, number>, now: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(now)) { const d = Math.round(v - (before[k] ?? 0)); if (d > 0) out[k] = d }
  return out
}

function run(seed: number, starter: string) {
  resetInfluenceClock()
  const world = createWorld(seed, starter)
  const botRng = makeRng(seed * 7919 + starter.length)
  const hh = config.render.visibleWorldHeight / 2
  const hw = hh * config.render.yScale * 1.8
  const timeline: { t: number; level: number; enemies: number; kills: number; hp: number; dps: number }[] = []
  let lastKills = 0, lastDamage = 0, capReachedAt = -1, spentDeclined = 0
  const hpHistory: number[] = []
  const takenHistory: Record<string, number>[] = []
  let lastBankTime = 0, lastVisits = 0
  const t0 = performance.now()
  const steps = Math.round(MAX / DT)
  for (let i = 0; i < steps && world.state === 'running'; i++) {
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
    // Spends levels a moment apart, like a person clicking, not all at once.
    if (world.pendingLevelUps > 0 && i % 30 === 0) {
      const before = world.pendingLevelUps
      pick(world, botRng)
      if (world.pendingLevelUps === before) { spentDeclined++; world.pendingLevelUps = 0 }
    }
    if (world.shopVisits !== lastVisits) { lastVisits = world.shopVisits; lastBankTime = world.time }
    if (i % 60 === 0) { hpHistory.push(Math.round(world.character.hp)); if (hpHistory.length > 12) hpHistory.shift(); takenHistory.push({ ...world.damageTakenBy }); if (takenHistory.length > 6) takenHistory.shift() }
    if (capReachedAt < 0 && world.enemies.length >= config.spawn.maxAlive) capReachedAt = world.time
    if (i % 3600 === 0 && i > 0) {
      timeline.push({ t: Math.round(world.time / 60), level: world.level, enemies: world.enemies.length, kills: world.kills - lastKills, hp: Math.round(world.character.hp), dps: Math.round((world.damageDealt - lastDamage) / 60) })
      lastKills = world.kills
      lastDamage = world.damageDealt
    }
  }
  const total = Math.max(1, world.damageDealt)
  const c = world.character
  let near = 0
  for (const e of world.enemies) if (Math.hypot(e.x - c.x, e.y - c.y) < 150) near++
  const death = world.state === 'dead' ? { intent: world.intent, gold: Math.round(world.gold), enemiesWithin150: near, shopDistance: Math.round(Math.hypot(world.shopX - c.x, world.shopY - c.y)), sinceLastBank: Math.round(world.time - lastBankTime), hpLast12s: hpHistory, maxHp: c.maxHp, upgrades: world.upgradesTaken, last5s: diffTaken(takenHistory[0] ?? {}, world.damageTakenBy) } : null
  return {
    seed, starter, bot: BOT, solo: SOLO,
    survived: Math.round(world.time), dead: world.state === 'dead', level: world.level, kills: world.kills,
    capReachedAt: Math.round(capReachedAt),
    banks: world.shopVisits, banked: Math.round(world.bankedThisRun), carriedAtEnd: Math.round(world.gold), earned: Math.round(world.goldEarned),
    spells: world.weapons.map((w) => ({ name: w.def.displayName, share: Math.round((w.damageDealt / total) * 1000) / 10, casts: w.timesCast })),
    upgrades: world.upgradesTaken,
    timeline, death, takenBy: Object.fromEntries(Object.entries(world.damageTakenBy).map(([k, v]) => [k, Math.round(v)])),
    msPerSimSecond: Math.round(((performance.now() - t0) / world.time) * 10) / 10,
  }
}

for (const starter of STARTERS) for (const seed of SEEDS) console.log(JSON.stringify(run(seed, starter)))
