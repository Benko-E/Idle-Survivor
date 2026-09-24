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

/** One kind of moment he has thoughts about. See data/thoughts.ts. */
export interface ThoughtMoment {
  lines: string[]
  /** 0 to 1: how often the moment gets a thought at all. */
  chance: number
  /** Seconds before this moment can prompt a thought again. */
  cooldown: number
  urgent?: boolean
}

/**
 * A character class: everything that makes him a wizard rather than anyone
 * else. Entries are in data/classes.ts. Everything shared by every class —
 * the conditions, the enemies, the world, the banked gold — lives elsewhere;
 * everything with personality lives here, so a new class is an entry and its
 * own abilities, not a rewrite.
 */
export interface ClassDef {
  id: string
  displayName: string
  description: string
  /**
   * What its abilities are called on screen: "Choose your first spell",
   * "New spell!". A ranger's might be "shot".
   */
  abilityNoun: string
  /**
   * The elements its abilities come in, which the build bonuses count: one of
   * each is prismatic, all one is pure. Elements themselves are shared — fire
   * is fire whoever casts it — but each class has its own abilities in them.
   */
  elements: string[]
  /** Base numbers, before any upgrade. */
  stats: {
    /** World units per second. */
    moveSpeed: number
    /** Collision radius, in world units. */
    radius: number
    maxHp: number
    /** Health a second, before upgrades. */
    hpRegen: number
  }
  /** Walk sheet, from render/sprites.ts. */
  sprite: string
  /** One-row strip played when a big ability goes off, if it has one. */
  castSprite?: string
  /** Drawn height in world units. */
  drawHeight: number
  /** What he thinks and when; the moments are named in ui/thoughts.ts. */
  thoughts: Record<string, ThoughtMoment>
}

/**
 * A state an enemy can be in: burning, chilled, frozen, shocked. Entries are
 * in data/conditions.ts; sim/statusEffects.ts runs them.
 */
export interface ConditionDef {
  /** What spells and upgrades apply it by, and ask about it by. */
  id: string
  displayName: string
  /**
   * Its one job, done at the strength it was applied with:
   *   damage      loses `strength` health a second — burning, poison, bleeding
   *   slow        moves `strength` (0..1) slower; only the strongest slow counts
   *   hold        can't move at all; strength unused — frozen, rooted
   *   vulnerable  takes `strength` (0.2 = +20%) more damage from every hit;
   *               only the strongest counts — shocked
   * A state that does two jobs is two conditions applied together.
   */
  effect: 'damage' | 'slow' | 'hold' | 'vulnerable'
  /**
   * What a second application does:
   *   refresh  from the same spell, tops up the time and keeps the stronger;
   *            from a different spell, sits alongside and both count
   *   stack    always adds another copy, up to maxStacks, oldest dropped
   */
  stacking: 'refresh' | 'stack'
  maxStacks?: number
  /**
   * After it wears off, it can't take hold again for this many seconds.
   * What keeps a freeze from holding a crowd still forever.
   */
  immuneAfter?: number
  /** Washed over the enemy's sprite while it lasts, at 0..1 strength. */
  tint: string
  tintStrength: number
}

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

  /**
   * Sprite sheet name, from src/render/sprites.ts. Recasting an enemy is
   * changing this string. `colour` remains the fallback if art is missing.
   */
  sprite?: string
  colour: string
  /**
   * Size relative to the art, 1 being true size. Every enemy is drawn at the
   * same pixel density (render.enemyPixelScale), so a bee next to a treant is
   * the size the artist drew it; this is for the deliberately oversized — a
   * spider the size of a pony is a heavy, not a different drawing.
   */
  scale?: number

  /**
   * Arrives as a group of this many at once, bunched on one bearing: a swarm
   * of bees, a wolf pack. Each member still costs one spawn, so a group of
   * eight means the next seven single spawns don't happen — the difficulty
   * curve's enemy count means the same thing either way.
   */
  groupSize?: number
  /** How far the group is scattered around its spawn point, in world units. */
  groupSpread?: number

  /** Flies: straight over trees rather than round them. */
  flying?: boolean
  /**
   * Never moves, and isn't shoved by the crowd: rooted to the spot like the
   * scenery it passes for. Its baseSpeed is ignored.
   */
  stationary?: boolean
  /**
   * At most this many alive at once. Things that never move would otherwise
   * pile up out of sight, and every one is a place in spawn.maxAlive.
   */
  maxAlive?: number

  /** Stops, paws the ground, then charges in a straight line. See sim/enemyBehaviours.ts. */
  charge?: ChargeDef
  /** Lights a fuse when it gets close to him, and blows up. */
  fuse?: FuseDef
  /** What happens where it dies. */
  onDeath?: DeathDef
}

export interface ChargeDef {
  /** Starts a charge when he's within this range. */
  range: number
  /** Seconds standing still, pawing the ground, before it goes: his warning. */
  windup: number
  /** World units per second while charging. Not scaled by the difficulty curve. */
  speed: number
  /** How far one charge runs. */
  distance: number
  /** Damage when a charge runs into him, once per charge. */
  impact: number
  /** Seconds standing dazed after a charge. */
  recover: number
  /** Seconds between charges. */
  cooldown: number
}

export interface BlastDef {
  radius: number
  /** To him, before the difficulty curve. Enemies caught in it take this scaled like their health. */
  damage: number
}

export interface FuseDef extends BlastDef {
  /** Lights when he's this close, edge to edge. */
  range: number
  /** Seconds from lit to bang. Zero goes off on the spot. */
  seconds: number
}

export interface DeathDef {
  /** Blows up: hurts him and every other enemy caught in it. */
  explode?: BlastDef
  /** Bursts into these, scattered within `spread`. */
  spawn?: { enemyId: string; count: number; spread: number }
  /** Leaves a patch of ground that hurts him while he stands in it. */
  hazard?: { radius: number; dps: number; seconds: number; colour: string }
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
  /**
   * The classes that can be offered it. Left out, every class can: health,
   * speed and pickup radius aren't anyone's flavour.
   */
  classIds?: string[]
  /**
   * The one spell it's for, by WeaponDef id. Offered only while he has that
   * spell, and its modifiers touch that spell and nothing else — so a pick
   * made for Firebolt can never leak into a spell taken later.
   */
  spellId?: string
  /**
   * mutation   changes how its spell works
   * evolution  transforms it: offered from draft.evolutionLevel, and taking
   *            one of a spell's evolutions rules out the rest for the run
   * Left out for plain stat upgrades.
   */
  kind?: 'mutation' | 'evolution'
  /** Upgrades (by id) that must already be taken: Combustion needs Ignite. */
  requires?: string[]
  /** Upgrades no longer offered once this one is taken: Phoenix Bolt already pierces everything. */
  retires?: string[]
  /**
   * Keywords its spell gains: burning, piercing, explosive. Anything that
   * asks what a spell is — an upgrade's requiresOwnedTags, a modifier's tag
   * selector — sees them like the spell's own tags.
   */
  grantsTags?: string[]
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
  /** One line for the starting pick and the draft card. */
  description: string
  /**
   * Switched off, it's never offered, can't be picked to start with, and
   * stops casting if he already has it. The way to take a spell out of the
   * game without deleting it — and it's live in the debug panel.
   */
  enabled: boolean
  /**
   * Which choice it belongs to: 1 is the starting pick, 2 and 3 open at the
   * levels in `spells.tierLevels`. One spell per tier, and picking one locks
   * out the rest of its tier for the run. A spell with no tier is never
   * offered at all — that's how a spell is kept in the data for later.
   */
  tier?: number
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
   *   cooldown     seconds between casts, before cooldownRecovery
   *   cooldownRecovery  recharge rate, 1 unless listed; 1.5 = 50% faster
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
   *   spread       radians between bolts that double up on one target
   *
   * Ground zones (behaviour 'zone') add:
   *
   *   delay        seconds between placing it and it landing
   *   duration     seconds it stays active after landing; 0 = one hit
   *   damage       dealt once, on landing
   *   dotDamage    per second to everything inside while active
   *   pull         world units per second it drags enemies inwards
   *   root         seconds enemies caught on landing can't move
   *   slow         chill on everything inside while active
   *   strikeRate   strikes per second while active, each on a random enemy
   *                inside; `damage` then goes to each strike instead of the
   *                landing, hitting everything within `strikeRadius`
   *
   * Orbiting spells (behaviour 'orbit') use count (orbs), area (orbit radius),
   * speed (radians per second), size (orb radius), damage and rehit (seconds
   * before the same enemy can be hit again).
   *
   * Any projectile can set `size`, its radius, for something bigger than a
   * bolt.
   *
   * On a projectile, `slow` or `dotDamage` with `duration` is left on each
   * enemy it hits: a chill, or a burn.
   */
  stats: Record<string, number>

  /**
   * How a spell that chooses a spot picks it. Only zones read this.
   *
   *   densest  the biggest crowd within range
   *   random   anywhere there's an enemy within range
   *   nearest  closest first
   */
  targeting?: 'densest' | 'random' | 'nearest'

  /**
   * Effect art, by name from art-source/fx/. All optional: anything missing
   * is drawn with the plain shapes instead, so a spell works before it has
   * art and the art can be swapped by changing a name here.
   *
   *   hit       flash on each enemy it hits directly
   *   arc       stretched between enemies a chain jumps across
   *   orb       what orbits him
   *   flames    set round an aura's edge
   *   fall      coming down onto a zone during its warning
   *   impact    when a zone lands
   *   cloud     hanging over an active zone
   *   strike    each strike from a zone that strikes
   *   ground    laid flat under an active zone
   *   particle  falling inside an active zone
   */
  /** The class this belongs to (data/classes.ts). No other class ever sees it. */
  classId: string
  /**
   * The condition its damage over time applies. Burning unless it says
   * otherwise; see data/conditions.ts.
   */
  dotCondition?: string
  fx?: Partial<Record<'hit' | 'arc' | 'orb' | 'flames' | 'fall' | 'impact' | 'cloud' | 'strike' | 'ground' | 'particle', string>>

  /** Placeholder art. */
  colour: string
}
