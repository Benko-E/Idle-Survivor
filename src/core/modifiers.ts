/**
 * The stat modifier system. (spec 5.5)
 *
 * Every number a spell uses is read through here, never straight off its data
 * entry. Right now there are no modifiers in the game at all — the upgrade
 * draft that produces them doesn't exist until step 6 — and that is exactly
 * why this goes in now. Retrofitting a resolver after twenty spells already
 * read their raw stats is the refactor this whole architecture exists to
 * avoid.
 *
 * An upgrade is data describing a change, and there is one machine that
 * applies all of them:
 *
 *   { target: 'damage',   op: 'increase', value: 0.15 }                  +15% damage
 *   { target: 'damage',   op: 'increase', value: 0.15, tags: ['fire'] }  +15% fire damage
 *   { target: 'cooldown', op: 'increase', value: -0.1 }                  10% faster casting
 *
 * There is never bespoke code for an individual upgrade.
 */

export type ModifierOp =
  /** Flat addition to the base value. */
  | 'add'
  /** A percentage, pooled additively with every other 'increase'. 0.15 = +15%. */
  | 'increase'
  /** A true multiplier, compounding with other multipliers. 1.15 = x1.15. */
  | 'multiply'

export interface Modifier {
  /** The stat key this applies to, e.g. 'damage', 'cooldown', 'area'. */
  target: string
  op: ModifierOp
  value: number
  /**
   * Optional selector. When present the modifier only applies to things
   * carrying *all* of these tags, which is what makes "+15% to fire spells"
   * possible without any code that knows what fire is.
   */
  tags?: string[]
}

function applies(modifier: Modifier, stat: string, subjectTags: readonly string[]): boolean {
  if (modifier.target !== stat) return false
  if (!modifier.tags || modifier.tags.length === 0) return true
  return modifier.tags.every((tag) => subjectTags.includes(tag))
}

/**
 * Resolve a base value against every modifier in play.
 *
 * Order is fixed and deliberate: flat additions, then the summed percentage
 * pool, then true multipliers.
 *
 *   (base + flat) * (1 + sum of increases) * product of multipliers
 *
 * Pooling percentages additively means two "+15% damage" picks give +30%, not
 * x1.3225. That's the boring answer, and boring is correct here — compounding
 * percentages make a build's power curve very hard to predict when a player
 * can stack the same upgrade six times.
 */
export function resolveStat(
  base: number,
  stat: string,
  modifiers: readonly Modifier[],
  subjectTags: readonly string[] = [],
): number {
  let flat = 0
  let increase = 0
  let multiplier = 1

  for (const modifier of modifiers) {
    if (!applies(modifier, stat, subjectTags)) continue

    switch (modifier.op) {
      case 'add':
        flat += modifier.value
        break
      case 'increase':
        increase += modifier.value
        break
      case 'multiply':
        multiplier *= modifier.value
        break
    }
  }

  return (base + flat) * (1 + increase) * multiplier
}
