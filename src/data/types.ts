import type { Modifier } from '../core/modifiers'

/**
 * The shape of every piece of content in the game. (spec 5.1)
 *
 * These describe what a *kind of thing* has, never what any specific thing is.
 * The simulation reads these fields; it never checks an id against a literal.
 * If you ever see `if (def.id === 'enemy_walker_01')` anywhere outside a data
 * file, something has gone wrong.
 */

/**
 * Free-form labels used by upgrade modifiers to select what they apply to.
 * (spec 5.5 — "+15% to fire-type weapons only")
 *
 * Deliberately untyped strings rather than an enum: a new tag should never
 * require touching engine code.
 */
export type Tag = string

export interface EnemyDef {
  /** Stable and generic. Never shown to a player. (spec 5.2) */
  id: string
  /** The only thing that ever appears on screen. Free to change at any time. */
  displayName: string
  tags: Tag[]

  /** Base stats, before the difficulty formulas scale them at spawn time. */
  baseHp: number
  baseSpeed: number
  /** Damage dealt to the character on contact. */
  contactDamage: number

  /**
   * Experience granted for killing it, before any xpGain modifiers.
   *
   * XP is not a thing you pick up — it's awarded automatically on the kill.
   * Gold is the thing that drops and gets carried to a shop. Keeping them
   * separate means a run's progression and its economy can be tuned
   * independently, and "+20% XP from undead" selects on this enemy's tags.
   */
  xpValue: number

  /** Collision size, and how much room it takes up in a crowd. */
  radius: number

  /**
   * How frightening this enemy is to the movement AI, as a multiplier on the
   * danger layer. Separate from contactDamage on purpose: how much something
   * hurts and how much it should be avoided are different questions, and
   * keeping them apart is what lets a harmless-but-obstructive enemy exist
   * later without any new code.
   */
  dangerWeight: number

  /**
   * Relative likelihood of being chosen when a spawn happens, and the earliest
   * run time (in seconds) at which it becomes eligible at all.
   */
  spawnWeight: number
  unlockAtSeconds: number

  /**
   * What this enemy leaves behind when it dies.
   *
   * Evaluated in order, and the *first* success wins — so list the good stuff
   * first and the consolation prize last. At most one drop per kill, which
   * keeps "how often does this mob give me something" a number you can reason
   * about instead of a probability puzzle.
   */
  drops: DropEntry[]

  /** Placeholder art. Replaced by a sprite reference later. */
  colour: string
  drawHeight: number
}

export interface DropEntry {
  pickupId: string
  /** 0..1, before the global scale in the config is applied. */
  chance: number
  /** Drop it already merged. Omit for an ordinary tier 0 globe. */
  tier?: number
}

/**
 * A *kind* of pickup, not a size of one.
 *
 * There are no separate entries for small, medium and large globes. Magnitude
 * is a tier number on each instance and everything about it — XP, pull, size,
 * colour, name — comes from a formula over that tier, so the ladder extends
 * upwards forever without anyone defining a rung. (spec 5.3)
 *
 * What stays data is the kind: an XP globe, a future gold pile, a health
 * potion. Those genuinely differ — different tags for modifiers to select on,
 * and different rules about whether they combine at all.
 */
export interface PickupDef {
  id: string
  tags: Tag[]

  /** Gold at tier 0, before tier scaling and before any goldGain modifiers. */
  baseGold: number

  /**
   * Pull on the movement AI at tier 0, deliberately separate from XP value.
   * They are different questions: a big globe should be worth a detour
   * without being worth walking into a pack for, and the config scales the
   * two at different rates for exactly that reason.
   */
  basePull: number

  /**
   * Whether piles of these combine into a bigger one. A health potion
   * probably shouldn't; XP globes very much should, because thirty of them
   * scattered around the character pull in thirty directions that cancel out
   * and leave him standing still in the middle.
   */
  merges: boolean

  /** Placeholder art. Size scales with tier; colour steps through this ramp. */
  baseSize: number
  tierColours: string[]
  /** Display names by tier, last entry reused for anything higher. */
  tierNames: string[]
}

/**
 * An upgrade is data describing a change. (spec 5.5)
 *
 * There is no code anywhere for any individual upgrade — taking one pushes
 * its modifiers into the world's list and the existing resolver does the
 * rest. "+15% damage" and "+30% damage to fire spells only" differ by one
 * field, not by one code path.
 */
export interface UpgradeDef {
  id: string
  displayName: string
  /** Shown on the card. Write it for a player, not for a spreadsheet. */
  description: string
  tags: Tag[]

  /** What taking it actually does. */
  modifiers: Modifier[]

  /** How many times it can ever be offered. */
  maxStacks: number
  /** Relative likelihood of appearing in a draft. */
  weight: number

  /**
   * Only offer this if he already owns something carrying all these tags.
   * Stops "+30% fire damage" turning up before he has a fire spell.
   */
  requiresOwnedTags?: Tag[]
}

export interface WeaponDef {
  /** Stable and generic. Never shown to a player. (spec 5.2) */
  id: string
  /** The only thing that ever appears on screen. */
  displayName: string
  /**
   * Both flavour and mechanics. Upgrade modifiers select on these, so
   * "+20% fire damage" or "+1 chain jump to lightning spells" need no code.
   */
  tags: Tag[]

  /**
   * Which entry in the behaviour registry casts this. The engine knows a set
   * of generic patterns; it never knows that Firebolt exists.
   *
   * A new spell that reuses an existing pattern is a data entry and nothing
   * else. A genuinely new *kind* of spell is a data entry plus one registered
   * function — that's the honest boundary of "content is data".
   */
  behaviour: string

  /**
   * A flat bag of numbers rather than a typed shape, because modifiers target
   * stats *by name*. A typed interface would mean every new stat any future
   * spell wants is a change to this file and to the resolver.
   *
   * Conventional keys, all optional, all meaningful only to the behaviour
   * that reads them:
   *
   *   cooldown     seconds between casts
   *   damage       damage per hit
   *   count        projectiles fired / targets chained / etc
   *   range        how far it will look for a target
   *   speed        projectile travel speed
   *   pierce       extra enemies a projectile passes through
   *   area         radius of an area effect
   *   duration     seconds an applied effect lasts
   *   dotDamage    damage per second for effects that linger
   *   slow         fraction of speed removed, 0.45 = 45% slower
   *   falloff      multiplier applied per chain jump
   *   spread       radians of scatter on multi-projectile casts
   */
  stats: Record<string, number>

  /** Placeholder art. */
  colour: string
}
