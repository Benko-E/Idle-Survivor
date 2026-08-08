import { config } from '../config'
import type { Pickup } from './world'

/**
 * Everything a globe's tier determines. (spec 5.3)
 *
 * All formulas over one integer, so there is no ceiling — tier 9 works
 * exactly as well as tier 1 and nobody had to define it.
 *
 * The important detail is that XP and pull scale at *different* rates. XP
 * multiplies by the merge count, which conserves value exactly: five globes
 * combining into one is worth precisely what the five were worth, so merging
 * is neutral rather than a hidden bonus or tax. Pull grows far more slowly,
 * so a big globe is loud but not so loud it drowns out survival.
 */

export function pickupXp(pickup: Pickup): number {
  return pickup.def.baseXp * Math.pow(config.pickups.merge.xpPerTier, pickup.tier)
}

export function pickupPull(pickup: Pickup): number {
  return pickup.def.basePull * Math.pow(config.pickups.merge.pullPerTier, pickup.tier)
}

export function pickupSize(pickup: Pickup): number {
  return pickup.def.baseSize * Math.pow(config.pickups.merge.sizePerTier, pickup.tier)
}

/** Ramps stop at the last entry, so tiers above the palette all look alike. */
export function pickupColour(pickup: Pickup): string {
  const ramp = pickup.def.tierColours
  return ramp[Math.min(pickup.tier, ramp.length - 1)]
}

export function pickupName(pickup: Pickup): string {
  const names = pickup.def.tierNames
  return names[Math.min(pickup.tier, names.length - 1)]
}
