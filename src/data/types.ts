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
  /** Damage dealt to the character on contact. Not wired up until step 2. */
  contactDamage: number

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
}

export interface PickupDef {
  id: string
  displayName: string
  tags: Tag[]

  /** Granted on collection, before any xpGain modifiers. */
  xp: number

  /**
   * How hard this tugs on the movement AI, deliberately separate from its XP
   * value. They are different questions: a grand globe should be worth a
   * detour without being worth walking into a pack for, and that trade-off is
   * a number here rather than a rule anywhere.
   */
  influenceWeight: number

  /** Placeholder art. */
  colour: string
  size: number
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
