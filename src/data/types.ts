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
   * Relative likelihood of being chosen when a spawn happens, and the earliest
   * run time (in seconds) at which it becomes eligible at all.
   */
  spawnWeight: number
  unlockAtSeconds: number

  /** Placeholder art. Replaced by a sprite reference later. */
  colour: string
  drawHeight: number
}
