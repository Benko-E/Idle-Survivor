// Runs the simulation to death and checks the banked/died announcements
// agree with what actually happened in the world.
import { config } from '@game/config'
import { updateCombat } from '@game/sim/combat'
import { hurtCharacter, updateContactDamage } from '@game/sim/damage'
import { currentOffers, takeOffer } from '@game/sim/draft'
import { updateEnemies } from '@game/sim/enemyMovement'
import { gameEvents } from '@game/sim/events'
import { resetInfluenceClock, updateInfluence } from '@game/sim/influence'
import { updateCharacterMovement } from '@game/sim/movement'
import { updatePickups } from '@game/sim/pickups'
import { bankThreshold, updateShop } from '@game/sim/shop'
import { updateSpawner } from '@game/sim/spawner'
import { updateTrail } from '@game/sim/trail'
import { updateVitals } from '@game/sim/vitals'
import { createWorld } from '@game/sim/world'

const DT = 1 / 60
let bankedTotal = 0
let bankEvents = 0
let died: { time: number; goldLost: number } | null = null
gameEvents.on('banked', ({ amount }) => { bankedTotal += amount; bankEvents++ })
gameEvents.on('died', (e) => { died = e })

function fingerprint(): string {
  // This checks the bookkeeping, not when he chooses to go: a low threshold,
  // so there are banks to check inside seven minutes whatever the defaults.
  const saved = { ...config.shop }
  Object.assign(config.shop, { spendThreshold: 60, thresholdMinutes: 1, confidentMinutes: 1 })
  resetInfluenceClock()
  const world = createWorld()
  const hh = config.render.visibleWorldHeight / 2
  const hw = hh * config.render.yScale * 1.8
  // Seven minutes of play, walking him onto the shop whenever he
  // wants to bank, so there are banks to check whatever the run does — with a
  // big enough crowd he can circle it for minutes without getting in, and
  // that isn't what this tests.
  // Then he's finished off, so the death announcement gets checked too.
  for (let i = 0; i < 60 * 60 * 7 && world.state === 'running'; i++) {
    if (i > 0 && i % 600 === 0 && world.intent === 'banking') {
      world.character.x = world.shopX
      world.character.y = world.shopY
    }
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
    if (world.pendingLevelUps > 0) takeOffer(world, currentOffers(world)[0])
  }
  if (world.state === 'running') hurtCharacter(world, 1e9, 'test')
  console.log('died at          ', world.time.toFixed(2), world.state)
  console.log('shop visits      ', world.shopVisits, '| banked events', bankEvents)
  console.log('bankedThisRun    ', world.bankedThisRun.toFixed(3), '| sum of events', bankedTotal.toFixed(3))
  console.log('carried at death ', world.gold.toFixed(3), '| died event', JSON.stringify(died))
  const ok = bankEvents === world.shopVisits
    && Math.abs(bankedTotal - world.bankedThisRun) < 1e-9
    && world.state === 'dead' && died !== null && died.goldLost === world.gold && died.time === world.time
    && world.shopVisits > 0
    && world.bankedThisRun + world.gold <= world.goldEarned + 1e-9
  console.log(ok ? 'PASS' : 'FAIL')
  Object.assign(config.shop, saved)
  return `${world.time.toFixed(4)} ${world.kills} ${world.bankedThisRun.toFixed(4)}`
}
fingerprint()

// He carries more before banking while he's doing well: about a minute of
// income when hurt, stretching to confidentMinutes when healthy.
{
  const world = createWorld()
  const saved = { ...config.shop }
  Object.assign(config.shop, { spendThreshold: 60, thresholdMinutes: 1, confidentMinutes: 3, confidentAbove: 0.8, nervousBelow: 0.4 })
  world.time = 300
  world.goldEarned = 500 // 100 a minute
  const at = (health: number) => { world.character.hp = world.character.maxHp * health; return bankThreshold(world) }
  const healthy = at(1), halfway = at(0.6), hurt = at(0.3)
  console.log('threshold healthy', healthy.toFixed(1), '| at 60%', halfway.toFixed(1), '| hurt', hurt.toFixed(1))
  config.shop.confidentMinutes = 1
  const off = at(1)
  console.log('threshold with confidentMinutes = thresholdMinutes', off.toFixed(1))
  world.goldEarned = 100 // 20 a minute: the floor still holds
  const poor = at(0.3)
  console.log('threshold on a poor income, hurt', poor.toFixed(1))
  Object.assign(config.shop, saved)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  console.log(near(healthy, 300) && near(halfway, 200) && near(hurt, 100) && near(off, 100) && near(poor, 60) ? 'PASS' : 'FAIL')
}

// Banking in passing: close to the shop with a fair amount on him, he pops in.
{
  const saved = { ...config.shop }
  Object.assign(config.shop, { spendThreshold: 240, thresholdMinutes: 4, confidentMinutes: 12, confidentAbove: 0.6, nervousBelow: 0.3, passingDistance: 300, passingShare: 0.25, passingGiveUp: 1.5 })
  const setup = (gold: number, shopDistance: number) => {
    const world = createWorld()
    world.time = 300
    world.goldEarned = 500 // 100 a minute: healthy, a trip at 1200
    world.gold = gold
    world.shopX = world.character.x + shopDistance
    world.shopY = world.character.y
    updateShop(world)
    return world
  }
  const near = setup(400, 200)
  console.log('near, carrying 400 of 1200', near.intent, near.passingBy)
  const far = setup(400, 500)
  const change = setup(200, 200)
  const full = setup(1300, 200)
  console.log('far', far.intent, '| pocket change', change.intent, '| full, passing?', full.passingBy)
  // Walk him in: the deposit counts as a pop-in.
  near.character.x = near.shopX
  near.character.y = near.shopY
  updateShop(near)
  console.log('popped in: banked', near.bankedThisRun, 'visits', near.shopVisits, 'of them passing', near.passingVisits, 'still flagged', near.passingBy)
  // Pushed well away by the crowd, a pop-in is given up; a real trip isn't.
  const pushed = setup(400, 200)
  pushed.character.x -= 300
  updateShop(pushed)
  const trip = setup(1300, 200)
  trip.character.x -= 300
  updateShop(trip)
  const filled = setup(400, 200)
  filled.gold = 1300
  filled.character.x -= 300
  updateShop(filled)
  console.log('pushed away: pop-in', pushed.intent, '| full trip', trip.intent, '| filled up on the way', filled.intent)
  config.shop.passingDistance = 0
  const off = setup(400, 200)
  Object.assign(config.shop, saved)
  const ok = near.bankedThisRun === 400 && near.shopVisits === 1 && near.passingVisits === 1 && !near.passingBy && near.intent === 'farming'
    && far.intent === 'farming' && change.intent === 'farming' && full.intent === 'banking' && !full.passingBy && off.intent === 'farming'
    && pushed.intent === 'farming' && !pushed.passingBy && trip.intent === 'banking' && filled.intent === 'banking' && !filled.passingBy
  console.log(ok ? 'PASS' : 'FAIL')
}
