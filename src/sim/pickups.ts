import { config } from '../config'
import type { World } from './world'

/**
 * Pickups on the ground, and collecting them.
 *
 * PLACEHOLDER SOURCE. Right now these simply appear near the character at a
 * fixed rate, because nothing can be killed yet. In step 4 the scatter below
 * is deleted and drops come from dying enemies instead.
 *
 * What is *not* placeholder is everything downstream: the value layer in the
 * influence map, the pull it exerts, and the collection radius. Swapping the
 * source changes nothing else.
 *
 * Why they have to exist now: with only a danger layer the best possible move
 * is always "walk away from everything", so the character runs in a straight
 * line forever and never dies. That's the failure mode the spec calls out —
 * the watchable behaviour only appears when something is worth risking a trip
 * into the swarm for.
 */

/**
 * Drop a pickup on top of a randomly chosen enemy.
 *
 * This is what makes the placeholder worth having. Scattering them at a random
 * angle around the character instead put nearly all of them in open ground —
 * the horde is always bunched on one side, so he could collect indefinitely
 * without ever going near anything, and the interesting behaviour never
 * appeared. Real drops come from enemies dying, which means they land exactly
 * where the danger is, and that's the situation the movement AI has to solve.
 *
 * Falls back to scattering around the character when nothing is alive.
 */
function scatterOne(world: World): void {
  if (world.enemies.length > 0) {
    const host = world.enemies[Math.floor(world.rng() * world.enemies.length)]
    const jitter = config.pickupScatter.dropJitter
    world.pickups.push({
      x: host.x + (world.rng() * 2 - 1) * jitter,
      y: host.y + (world.rng() * 2 - 1) * jitter,
    })
    return
  }

  const { minDistance, maxDistance } = config.pickupScatter
  const angle = world.rng() * Math.PI * 2
  const distance = minDistance + world.rng() * (maxDistance - minDistance)

  world.pickups.push({
    x: world.character.x + Math.cos(angle) * distance,
    y: world.character.y + Math.sin(angle) * distance,
  })
}

function collect(world: World): void {
  const radius = config.pickupScatter.collectRadius
  const radiusSquared = radius * radius
  const { x: cx, y: cy } = world.character

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pickup = world.pickups[i]
    const dx = pickup.x - cx
    const dy = pickup.y - cy
    if (dx * dx + dy * dy > radiusSquared) continue

    world.pickups[i] = world.pickups[world.pickups.length - 1]
    world.pickups.pop()
    world.pickupsCollected++
  }
}

/** Drop anything he has walked far enough away from to have clearly given up on. */
function cullDistant(world: World): void {
  const limit = config.pickupScatter.forgetDistance
  const limitSquared = limit * limit
  const { x: cx, y: cy } = world.character

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pickup = world.pickups[i]
    const dx = pickup.x - cx
    const dy = pickup.y - cy
    if (dx * dx + dy * dy <= limitSquared) continue

    world.pickups[i] = world.pickups[world.pickups.length - 1]
    world.pickups.pop()
  }
}

export function updatePickups(world: World, dt: number): void {
  collect(world)
  cullDistant(world)

  world.pickupCredit += config.pickupScatter.spawnsPerSecond * dt
  while (world.pickupCredit >= 1) {
    world.pickupCredit -= 1
    if (world.pickups.length >= config.pickupScatter.maxAlive) {
      world.pickupCredit = 0
      break
    }
    scatterOne(world)
  }
}
