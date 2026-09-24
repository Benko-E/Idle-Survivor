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
import { updateShop } from '@game/sim/shop'
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
  return `${world.time.toFixed(4)} ${world.kills} ${world.bankedThisRun.toFixed(4)}`
}
fingerprint()
