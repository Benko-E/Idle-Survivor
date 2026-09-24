// Headless verification of the review fixes. The simulation imports nothing
// from render/ or ui/, so it runs in Node as-is. The step order below mirrors
// update() in src/main.ts.
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
import { createWorld, type World } from '@game/sim/world'

const DT = 1 / 60

/** What the renderer would report as visible world for a window of this shape. */
function view(aspect: number): { hw: number; hh: number } {
  const hh = config.render.visibleWorldHeight / 2
  return { hw: hh * config.render.yScale * aspect, hh }
}

interface Options {
  aspect: number
  seconds: number
  /** Open the draft (roll offers) at these times without taking anything. */
  peekAt?: number[]
  /** Take the first offer whenever a level is pending. */
  takeOffers?: boolean
}

function run(options: Options): { world: World; fingerprint: string } {
  resetInfluenceClock()
  const world = createWorld()
  const { hw, hh } = view(options.aspect)
  const peeks = [...(options.peekAt ?? [])]

  const steps = Math.round(options.seconds / DT)
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

    if (peeks.length && world.time >= peeks[0]) {
      peeks.shift()
      currentOffers(world)
    }
    if (options.takeOffers && world.pendingLevelUps > 0) {
      const offers = currentOffers(world)
      if (offers.length) takeOffer(world, offers[0])
    }
  }

  const c = world.character
  const fingerprint = [
    world.time.toFixed(4), world.state, c.x.toFixed(6), c.y.toFixed(6), c.hp.toFixed(6),
    world.kills, world.enemies.length, world.nextEnemyId, world.gold.toFixed(4), world.level,
  ].join(' ')
  return { world, fingerprint }
}

const seconds = 75

console.log('1. Same seed, different window widths (both under designAspect 2.4):')
const narrow = run({ aspect: 1.5, seconds })
const wide = run({ aspect: 2.2, seconds })
console.log('   aspect 1.5 ->', narrow.fingerprint)
console.log('   aspect 2.2 ->', wide.fingerprint)
console.log('   identical:', narrow.fingerprint === wide.fingerprint)

console.log('\n2. Opening the draft without picking must not change the run:')
const peeked = run({ aspect: 1.5, seconds, peekAt: [15, 30, 45, 60] })
console.log('   never opened ->', narrow.fingerprint)
console.log('   opened x4    ->', peeked.fingerprint)
console.log('   identical:', narrow.fingerprint === peeked.fingerprint)

console.log('\n3. Offers are frozen until one is taken (no free reroll):')
{
  resetInfluenceClock()
  const w = createWorld()
  w.pendingLevelUps = 1
  const first = currentOffers(w).map((o) => o.id).join(',')
  const second = currentOffers(w).map((o) => o.id).join(',')
  const third = currentOffers(w).map((o) => o.id).join(',')
  console.log('   open 1:', first)
  console.log('   open 2:', second)
  console.log('   open 3:', third)
  console.log('   frozen:', first === second && second === third)
  const stale = currentOffers(w)[0]
  takeOffer(w, stale)
  const before = w.weapons.length + Object.keys(w.upgradesTaken).length
  takeOffer(w, stale) // the same card again, e.g. clicked twice
  const after = w.weapons.length + Object.keys(w.upgradesTaken).length
  console.log('   stale card ignored:', before === after)
}

console.log('\n4. Spells no longer burn cooldown on empty air:')
{
  const r = run({ aspect: 1.5, seconds: 60, takeOffers: true })
  for (const w of r.world.weapons) {
    console.log(`   ${w.def.displayName.padEnd(18)} cast ${String(w.timesCast).padStart(4)}  idle ${w.idleSeconds.toFixed(1)}s`)
  }
  console.log('   state after 60s:', r.fingerprint)
}

console.log('\n5. Fractional counts no longer crash:')
{
  const saved = config.movement.sampleDirections
  config.movement.sampleDirections = 24.3
  try {
    run({ aspect: 1.5, seconds: 2 })
    console.log('   sampleDirections = 24.3 -> ran fine')
  } catch (e) {
    console.log('   sampleDirections = 24.3 -> THREW', e)
  } finally {
    config.movement.sampleDirections = saved
  }
}
