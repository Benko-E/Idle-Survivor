import { config } from '../config'
import { updatePickupMerging } from './pickupMerge'
import { pickupXp } from './pickupTiers'
import { characterStat } from './stats'
import type { World } from './world'

/**
 * Collecting what's on the ground, and forgetting what he's clearly abandoned.
 *
 * Nothing here spawns anything any more — the placeholder scatter is gone and
 * drops come from dying enemies (see drops.ts). That changes what the value
 * layer rewards in a way worth noticing: pickups now only exist where he has
 * *already won*, so the field pulls him towards ground he has cleared rather
 * than towards a live horde.
 */

function collect(world: World): void {
  // Read through the modifier system so a future "+40% pickup radius" upgrade
  // needs no changes here.
  const radius = characterStat(world, 'pickupRadius', config.pickups.collectRadius)
  const radiusSquared = radius * radius
  const { x: cx, y: cy } = world.character

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pickup = world.pickups[i]
    const dx = pickup.x - cx
    const dy = pickup.y - cy
    if (dx * dx + dy * dy > radiusSquared) continue

    // Tags come from the globe, so "+50% XP from rare globes" selects on them,
    // and a debuff is { target: 'xpGain', op: 'multiply', value: 0.5 }.
    const gained = characterStat(world, 'xpGain', pickupXp(pickup), pickup.def.tags)
    world.xp += gained
    // TEMPORARY: also counts towards the shop trip. Becomes gold later.
    world.carried += gained
    world.pickupsCollected++

    world.pickups[i] = world.pickups[world.pickups.length - 1]
    world.pickups.pop()
  }
}

/**
 * Track anything he came close to but didn't take.
 *
 * This is a measurement rather than a mechanic. He was visibly walking past
 * collectable globes, and "did that get better?" is not a question two people
 * squinting at a screen can answer honestly.
 */
function trackNearMisses(world: World): void {
  const distance = config.debug.nearMissDistance
  const distanceSquared = distance * distance
  const { x: cx, y: cy } = world.character

  for (const pickup of world.pickups) {
    if (pickup.wasNear) continue
    const dx = pickup.x - cx
    const dy = pickup.y - cy
    if (dx * dx + dy * dy > distanceSquared) continue
    pickup.wasNear = true
  }
}

/** Drop anything he has walked far enough away from to have clearly given up on. */
function cullDistant(world: World): void {
  const limit = config.pickups.forgetDistance
  const limitSquared = limit * limit
  const { x: cx, y: cy } = world.character

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const pickup = world.pickups[i]
    const dx = pickup.x - cx
    const dy = pickup.y - cy
    if (dx * dx + dy * dy <= limitSquared) continue

    // It got within grabbing distance at some point and he left it. That's the
    // failure this counter exists to catch.
    if (pickup.wasNear) world.pickupsMissed++

    world.pickups[i] = world.pickups[world.pickups.length - 1]
    world.pickups.pop()
  }
}

export function updatePickups(world: World, dt: number): void {
  collect(world)
  updatePickupMerging(world, dt)
  trackNearMisses(world)
  cullDistant(world)
}
