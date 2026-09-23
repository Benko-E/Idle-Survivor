import { config } from '../config'
import type { Modifier } from '../core/modifiers'
import { makeRng, type Rng } from '../core/rng'
import { findWeaponDef } from '../data/weapons'
import type { EnemyDef, PickupDef, WeaponDef } from '../data/types'
import type { BuildBonus } from './buildBonus'
import type { Offer } from './draft'
import { spellsOfTier } from './spellTiers'
import type { Projectile } from './projectiles'
import type { StatusEffect } from './statusEffects'
import type { VisitMark } from './trail'
import type { Vfx } from './vfx'
import type { Zone } from './zones'

/**
 * All mutable game state, in one object.
 *
 * Nothing lives in module-level variables. That's what makes "he died, start a
 * new run" a matter of calling createWorld() again rather than hunting down
 * every piece of state scattered across the codebase.
 */

export type RunState = 'running' | 'dead'

export interface Character {
  x: number
  y: number
  radius: number
  speed: number
  hp: number
  maxHp: number
  /** Unit vector. Movement steers this rather than setting it outright. */
  facingX: number
  facingY: number
  /**
   * Total distance walked. Drives the walk animation, so his feet keep pace
   * with a speed upgrade instead of shuffling at the base rate.
   */
  stride: number
}

export interface Enemy {
  /** Stable per-instance handle, so a projectile can remember what it hit. */
  id: number
  /**
   * A reference to the shared definition, not a copy of it. Static properties
   * (colour, size, display name) are read straight off the def; only values
   * that vary per instance live on the enemy itself.
   */
  def: EnemyDef
  x: number
  y: number
  hp: number
  maxHp: number
  /** Resolved at spawn from the def's base speed and the difficulty curve. */
  speed: number
  effects: StatusEffect[]
  /**
   * Total distance walked. Drives the walk animation — reading it off
   * distance rather than time is what makes a chilled enemy visibly trudge.
   */
  stride: number
  /** The element that last hit it, for Elemental Equilibrium. */
  markedBy?: string
  /** World time that mark wears off. */
  markedUntil?: number
}

export interface Pickup {
  def: PickupDef
  /**
   * Magnitude. Everything it's worth and how loudly it calls to the character
   * is a formula over this number — see sim/pickupTiers.ts.
   */
  tier: number
  x: number
  y: number
  /** Came within near-miss distance at some point. Measurement only. */
  wasNear: boolean
}

export interface WeaponInstance {
  def: WeaponDef
  cooldownRemaining: number
  /** Casts that actually hit something. */
  timesCast: number
  /**
   * Seconds spent ready but with nothing in reach. A spell with a lot of idle
   * time and few casts has a range too short for how he plays.
   */
  idleSeconds: number
  /**
   * Damage this spell has dealt this run, overkill excluded. Everything it
   * caused counts: its bolts, its effects ticking later, its zones.
   */
  damageDealt: number
  /**
   * When each enemy was last hit by this spell, by enemy id. Only spells that
   * touch the same enemies over and over use it — an orb circling through a
   * crowd must not hit the same one sixty times a second.
   */
  hitLog?: Map<number, number>
}

export interface World {
  /** What this run was generated from. Same seed, same choices, same run. */
  seed: number
  /** Seconds since the run started. Every difficulty formula reads this. */
  time: number
  state: RunState
  /** The simulation's randomness. Nothing driven by player input may draw on it. */
  rng: Rng
  /**
   * A separate stream for the level-up draft, so when you open it has no
   * effect on the run. See sim/draft.ts.
   */
  draftRng: Rng
  /** The offers for the level waiting to be spent, once rolled. */
  draftOffers: Offer[] | null

  character: Character
  enemies: Enemy[]
  pickups: Pickup[]
  projectiles: Projectile[]
  /** Ground a spell has claimed: strikes on their way down, vortices, roots. */
  zones: Zone[]
  vfx: Vfx[]
  /** Where he's recently been. Oldest first. */
  trail: VisitMark[]
  lastMarkX: number
  lastMarkY: number

  weapons: WeaponInstance[]
  /** Every stat change in play, from upgrades taken in the draft. */
  modifiers: Modifier[]
  /** Earned when the last spell tier is chosen; see sim/buildBonus.ts. */
  buildBonus: BuildBonus

  /** Awarded per kill, never dropped. See sim/progression.ts. */
  xp: number
  level: number
  /** XP accumulated towards the next level, for the bar. */
  xpIntoLevel: number
  /** Levels earned but not yet spent. The draft consumes these. */
  pendingLevelUps: number
  /** How many times each upgrade has been taken, for maxStacks. */
  upgradesTaken: Record<string, number>

  /** Gold in his pocket right now. Zeroed at the shop, lost if he dies. */
  gold: number
  /** Lifetime gold this run, for the readout. */
  goldEarned: number
  /**
   * What he's currently trying to do. The only high-level state in the game —
   * everything about *how* he gets anywhere stays emergent from the field.
   */
  intent: 'farming' | 'banking'
  shopX: number
  shopY: number
  shopVisits: number
  /** Deposited at the shop this run, and so safe. */
  bankedThisRun: number

  /** Fractional spawns carried between frames, so rates aren't rounded away. */
  spawnCredit: number
  /** Throttle clock for the globe merge pass. */
  mergeCredit: number
  nextEnemyId: number

  /** Debug readouts. */
  wraps: number
  pickupsCollected: number
  /** Globes he came within reach of and left behind. */
  pickupsMissed: number
  incomingDps: number
  kills: number
  damageDealt: number
}

/**
 * A fresh run. `starterId` is the spell picked on the menu; without one it's
 * the first of the starting choices, which is what the headless tests get.
 */
export function createWorld(seed: number = config.world.seed, starterId?: string): World {
  const rng = makeRng(seed)

  // Somewhere out there, at a random bearing. Far enough that reaching it is
  // a journey rather than a detour.
  const shopAngle = rng() * Math.PI * 2

  return {
    seed,
    time: 0,
    state: 'running',
    rng,
    // Derived from the seed rather than independent, so a given seed still
    // produces the same drafts every time.
    draftRng: makeRng(seed ^ 0x5bd1e995),
    draftOffers: null,
    character: {
      x: 0,
      y: 0,
      radius: config.character.radius,
      speed: config.character.moveSpeed,
      hp: config.character.maxHp,
      maxHp: config.character.maxHp,
      facingX: 1,
      facingY: 0,
      stride: 0,
    },
    enemies: [],
    pickups: [],
    projectiles: [],
    zones: [],
    vfx: [],
    trail: [],
    lastMarkX: 0,
    lastMarkY: 0,
    weapons: startingSpells(starterId).map((id) => ({
      def: findWeaponDef(id),
      // Ready almost at once. There's only one starting spell, and since a
      // miss no longer spends the cooldown, spells drift out of lockstep on
      // their own as each finds targets at different moments.
      cooldownRemaining: 0.15,
      timesCast: 0,
      idleSeconds: 0,
      damageDealt: 0,
    })),
    modifiers: [],
    buildBonus: null,
    xp: 0,
    level: 1,
    xpIntoLevel: 0,
    pendingLevelUps: 0,
    upgradesTaken: {},
    gold: 0,
    goldEarned: 0,
    intent: 'farming',
    shopX: Math.cos(shopAngle) * config.shop.distanceFromStart,
    shopY: Math.sin(shopAngle) * config.shop.distanceFromStart,
    shopVisits: 0,
    bankedThisRun: 0,
    spawnCredit: 0,
    mergeCredit: 0,
    nextEnemyId: 1,
    wraps: 0,
    pickupsCollected: 0,
    pickupsMissed: 0,
    incomingDps: 0,
    kills: 0,
    damageDealt: 0,
  }
}

/** The chosen starter, plus any extra spells the config hands out for testing. */
function startingSpells(starterId: string | undefined): string[] {
  const starter = starterId ?? spellsOfTier(1)[0]?.id ?? 'spell_bolt_01'
  const ids = [starter, ...config.character.startingWeaponIds]
  return ids.filter((id, index) => ids.indexOf(id) === index)
}
