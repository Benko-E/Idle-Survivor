// The level-up cards: more than three of them, breakpoint levels whose cards
// are all about one thing, either-or pairs, and what the tooltips say.
import { config } from '@game/config'
import type { UpgradeDef } from '@game/data/types'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import {
  applyUpgrade,
  cardsThisLevel,
  currentOffers,
  draftBreakpoint,
  draftLevel,
  partnerOf,
  upgradeIsEligible,
  type Offer,
} from '@game/sim/draft'
import { characterStat, weaponStat } from '@game/sim/stats'
import { formatStat, upgradeBuildsOn, upgradeChanges, upgradeLocksOut, upgradePick } from '@game/sim/upgradeInfo'
import { createWorld, type World } from '@game/sim/world'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${detail}`)
  if (!ok) failures++
}
const up = (id: string) => UPGRADE_DEFS.find((def) => def.id === id)!
const spell = (id: string) => WEAPON_DEFS.find((def) => def.id === id)!

/** Firebolt (tier 1), plus any other spells named, with one level waiting at `level`. */
function world(seed: number, level: number, pending = 1, extra: string[] = []): World {
  const w = createWorld(seed, 'spell_bolt_01')
  for (const id of extra) w.weapons.push({ def: spell(id), cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 })
  w.level = level
  w.pendingLevelUps = pending
  return w
}
const deal = (w: World): Offer[] => {
  w.draftOffers = null
  return currentOffers(w)
}
const isComfort = (offer: Offer) => offer.def.tags.includes('utility')
const noRepeats = (offers: Offer[]) => new Set(offers.map((offer) => offer.id)).size === offers.length

// --- More cards ------------------------------------------------------------

{
  const saved = config.draft.choices
  config.draft.choices = 5
  let all5 = true
  let unique = true
  let left = 0
  let right = 0
  const n = 400
  for (let seed = 1; seed <= n; seed++) {
    const offers = deal(world(seed, 2))
    if (offers.length !== 5) all5 = false
    if (!noRepeats(offers)) unique = false
    if (!isComfort(offers[0])) left++
    if (isComfort(offers[offers.length - 1])) right++
  }
  check('five cards when draft.choices is 5', all5)
  check('no card twice in a hand', unique)
  check('left card still leans to fighting', left / n > 0.85, `${((left / n) * 100).toFixed(0)}%`)
  check('right card still leans to comfort with five', right / n > 0.6, `${((right / n) * 100).toFixed(0)}%`)
  config.draft.choices = saved

  const w = world(1, 2)
  w.extraCards = 1
  check("a run's extra card makes four", deal(w).length === 4 && cardsThisLevel(w) === 4)
}

// --- Breakpoints -----------------------------------------------------------

{
  check('level being spent: level 14, three waiting -> 12', draftLevel(world(1, 14, 3)) === 12)
  check('level being spent: level 14, one waiting -> 14', draftLevel(world(1, 14, 1)) === 14)
  check('level being spent: nothing waiting -> his level', draftLevel(world(1, 14, 0)) === 14)

  const starter = config.draft.breakpoints.starter
  check('level 12 is the starting spell breakpoint', starter.level === 12 && starter.spellTier === 1)

  let allFirebolt = true
  let saved = true
  let mixed = false
  for (let seed = 1; seed <= 300; seed++) {
    if (!deal(world(seed, 12, 1, ['spell_aura_01'])).every((offer) => offer.def.spellId === 'spell_bolt_01')) allFirebolt = false
    // Opened late: level 14 with three waiting is still level 12's draft.
    if (!deal(world(seed, 14, 3, ['spell_aura_01'])).every((offer) => offer.def.spellId === 'spell_bolt_01')) saved = false
    if (deal(world(seed, 13, 1, ['spell_aura_01'])).some((offer) => offer.def.spellId !== 'spell_bolt_01')) mixed = true
  }
  check('level 12: every card is a Firebolt upgrade', allFirebolt)
  check('level 12 opened at level 14: still all Firebolt', saved)
  check('level 13: back to a mixed hand', mixed)

  // Only Backdraft left for Firebolt: one Firebolt card, the rest dealt as usual.
  const short = world(3, 12, 1, ['spell_aura_01'])
  for (const def of UPGRADE_DEFS) {
    if (def.spellId !== 'spell_bolt_01' || def.kind !== 'mutation' || def.id === 'up_fb_backdraft') continue
    for (let i = 0; i < def.maxStacks; i++) applyUpgrade(short, def)
  }
  const shortHand = deal(short)
  const fireboltCards = shortHand.filter((offer) => offer.def.spellId === 'spell_bolt_01')
  check('focus runs short: filled up to three anyway', shortHand.length === 3 && noRepeats(shortHand))
  check('focus runs short: its one card is still dealt', fireboltCards.length === 1 && fireboltCards[0].id === 'up_fb_backdraft')

  const evolutions = config.draft.breakpoints.evolutions
  check('level 20 is the evolutions breakpoint', evolutions.level === 20 && evolutions.kind === 'evolution')
  let allEvolutions = true
  let filled = true
  for (let seed = 1; seed <= 200; seed++) {
    if (!deal(world(seed, 20, 1, ['spell_aura_01'])).every((offer) => offer.def.kind === 'evolution')) allEvolutions = false
    const alone = deal(world(seed, 20))
    if (alone.length !== 3 || alone.filter((offer) => offer.def.kind === 'evolution').length !== 2) filled = false
  }
  check('level 20 with two spells: every card an evolution', allEvolutions)
  check('level 20 with Firebolt alone: its 2 evolutions and a filler', filled)

  const early = world(1, 21, 3)
  check('evolutions wait for level 20 even when saved up', !upgradeIsEligible(early, up('up_fb_fireball')), `spending level ${draftLevel(early)}`)
  check('...and are there once level 20 is the one being spent', upgradeIsEligible(world(1, 22, 3), up('up_fb_fireball')))

  starter.extraCards = 1
  check('a breakpoint with an extra card deals four', deal(world(1, 12)).length === 4)
  check('...that level only', deal(world(1, 13)).length === 3)
  starter.extraCards = 0
  check('no breakpoint on an ordinary level', draftBreakpoint(world(1, 13)) === null)
}

// --- Either-or pairs -------------------------------------------------------

{
  const base = { spellId: 'spell_bolt_01', kind: 'mutation' as const, tags: ['offence' as const, 'fire' as const], maxStacks: 1, weight: 300 }
  const heavy: UpgradeDef = {
    ...base,
    id: 'test_heavy',
    displayName: 'Heavy Bolt',
    description: 'Bigger, slower, harder',
    pairedWith: 'test_accel',
    modifiers: [{ target: 'boltDamage', op: 'multiply', value: 1.6 }],
  }
  const accel: UpgradeDef = {
    ...base,
    id: 'test_accel',
    displayName: 'Accelerating Bolt',
    description: 'Speeds up, hits harder',
    modifiers: [{ target: 'boltSpeed', op: 'multiply', value: 1.5 }],
  }
  UPGRADE_DEFS.push(heavy, accel)

  check('partner found from either side', partnerOf(heavy) === accel && partnerOf(accel) === heavy)

  let seen = 0
  let together = true
  for (let seed = 1; seed <= 400; seed++) {
    const offers = deal(world(seed, 2))
    const h = offers.findIndex((offer) => offer.def === heavy)
    const a = offers.findIndex((offer) => offer.def === accel)
    if (h < 0 && a < 0) continue
    seen++
    if (h < 0 || a < 0 || a !== h + 1 || offers.length !== 3) together = false
  }
  check('a pair is always dealt together, side by side', seen > 50 && together, `${seen} hands had it`)

  const saved = config.draft.choices
  config.draft.choices = 1
  let never = true
  for (let seed = 1; seed <= 200; seed++) {
    const offers = deal(world(seed, 2))
    if (offers.length !== 1 || offers.some((offer) => offer.def === heavy || offer.def === accel)) never = false
  }
  config.draft.choices = saved
  check('never dealt without room for both', never)

  const took = world(1, 2)
  applyUpgrade(took, heavy)
  check('taking one rules out the other', !upgradeIsEligible(took, accel))
  const other = world(1, 2)
  applyUpgrade(other, accel)
  check('...either way round', !upgradeIsEligible(other, heavy))
  check('the tooltip says what it locks out', upgradeLocksOut(world(1, 2), heavy).includes(accel))

  UPGRADE_DEFS.splice(UPGRADE_DEFS.indexOf(heavy), 2)
}

// --- Tooltips --------------------------------------------------------------

{
  const w = world(1, 5)
  const pierce = upgradeChanges(w, up('up_fb_pierce'))
  check('Pierce: enemies pierced 0 -> 1', pierce.length === 1 && pierce[0].label === 'enemies pierced' && pierce[0].before === 0 && pierce[0].after === 1)
  applyUpgrade(w, up('up_fb_pierce'))
  const again = upgradeChanges(w, up('up_fb_pierce'))[0]
  check('...and 1 -> 2 once taken', again.before === 1 && again.after === 2)
  const pick = upgradePick(w, up('up_fb_pierce'))
  check('...as pick 2 of 3', pick.pick === 2 && pick.of === 3)

  const hardy = upgradeChanges(w, up('up_vigour_01'))
  const maxHp = w.classDef.stats.maxHp
  check('Hardy: maximum health +20', hardy.length === 1 && hardy[0].before === maxHp && hardy[0].after === maxHp + 20)

  const focus = upgradeChanges(w, up('up_damage_01'))
  const firebolt = spell('spell_bolt_01')
  check(
    'Focused Will names the spell whose damage it raises',
    focus.length === 1 && focus[0].spell === 'Firebolt' && Math.abs(focus[0].after - firebolt.stats.damage * 1.15) < 1e-9,
  )
  check('+30% frost damage with no frost spell: no numbers', upgradeChanges(w, up('up_frost_01')).length === 0)

  const fireball = upgradeChanges(w, up('up_fb_fireball'))
  const boltDamage = fireball.find((change) => change.stat === 'boltDamage')
  check('Fireball: bolt damage ×1 -> ×2.8', boltDamage?.before === 1 && Math.abs(boltDamage.after - 2.8) < 1e-9)

  const fresh = world(1, 20)
  check('Fireball rules out Phoenix Bolt', upgradeLocksOut(fresh, up('up_fb_fireball')).map((def) => def.id).join() === 'up_fb_phoenix')
  check(
    'Phoenix Bolt rules out Pierce and Fireball',
    upgradeLocksOut(fresh, up('up_fb_phoenix')).map((def) => def.id).sort().join() === 'up_fb_fireball,up_fb_pierce',
  )
  for (let i = 0; i < 3; i++) applyUpgrade(fresh, up('up_fb_pierce'))
  check('...but not a Pierce already taken to the full', upgradeLocksOut(fresh, up('up_fb_phoenix')).map((def) => def.id).join() === 'up_fb_fireball')
  check('Combustion builds on Ignite', upgradeBuildsOn(up('up_fb_combust')).map((def) => def.id).join() === 'up_fb_ignite')

  check('formats: 99 pierce is "all"', formatStat(99, 'count') === 'all')
  check('formats: percent, times, seconds', formatStat(1.15, 'percent') === '115%' && formatStat(2.8, 'times') === '×2.8' && formatStat(1.5, 'seconds') === '1.5s')

  // The tooltip's "after" is what the game will actually read once it's taken,
  // for every upgrade and every spell he could have: no number can lie.
  let honest = true
  let lines = 0
  const kit = ['spell_aura_01', 'spell_wall_01', 'spell_chain_01', 'spell_frostbolt_01']
  for (const def of UPGRADE_DEFS) {
    const before = world(1, 20, 1, kit)
    const changes = upgradeChanges(before, def)
    const after = world(1, 20, 1, kit)
    applyUpgrade(after, def)
    for (const change of changes) {
      lines++
      let real: number
      if (change.spellId) {
        const weapon = after.weapons.find((x) => x.def.id === change.spellId)!
        // The fallbacks the game reads these with (sim/behaviours.ts, combat.ts).
        const fallback = ['boltDamage', 'boltSpeed', 'boltSize', 'cooldownRecovery'].includes(change.stat) ? 1 : 0
        real = weaponStat(after, weapon, change.stat, fallback)
      } else {
        real = characterStat(after, change.stat, baseOf(after, change.stat))
      }
      if (Math.abs(real - change.after) > 1e-9) {
        honest = false
        console.log(`   ${def.id} ${change.spellId ?? 'him'} ${change.stat}: tooltip ${change.after}, game ${real}`)
      }
    }
  }
  check('every tooltip number is what the game then reads', honest && lines > 30, `${lines} lines checked`)

  const long = UPGRADE_DEFS.filter((def) => def.description.length > 45).map((def) => def.id)
  check('every card line is short (45 characters at most)', long.length === 0, long.join(' '))
  const bare = UPGRADE_DEFS.filter((def) => def.spellId && !def.details).map((def) => def.id)
  check("every spell's upgrade has details for its tooltip", bare.length === 0, bare.join(' '))
}

function baseOf(w: World, stat: string): number {
  if (stat === 'maxHp') return w.classDef.stats.maxHp
  if (stat === 'hpRegen') return w.classDef.stats.hpRegen
  if (stat === 'moveSpeed') return w.classDef.stats.moveSpeed
  if (stat === 'pickupRadius') return config.pickups.collectRadius
  return 1
}

if (failures > 0) process.exitCode = 1
