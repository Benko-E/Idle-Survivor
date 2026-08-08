/**
 * THE tuning file. (spec 5.4)
 *
 * Every system-level number in the game lives in this one object. If a number
 * describes *how a system behaves* it belongs here. If it describes *a specific
 * piece of content* (this enemy's HP, that weapon's damage) it belongs in a
 * data file under src/data/ instead.
 *
 * The in-game debug panel will eventually read and write these live, so keep
 * everything a plain number, string or boolean — no functions, no classes.
 */
export const config = {
  render: {
    backgroundColour: '#0f1418',
    gridColour: '#1a232b',
    gridCellSize: 96,

    /**
     * The world is flat: positions are x/y only, there is no vertical axis.
     * Moving "up" means moving away from the camera, not upward. (spec I)
     *
     * This squashes the world's Y axis when drawing, which is the entire
     * source of the sense of depth. 1.0 = a pure top-down grid,
     * lower = a shallower, more side-on viewing angle.
     */
    yScale: 0.82,

    /** Ground shadow under each sprite. Sells the ground plane; purely cosmetic. */
    shadowAlpha: 0.28,
    shadowWidthRatio: 0.9,

    /**
     * How quickly the camera catches up to the character, per second.
     * Higher = stiffer. The world is endless (spec A) so the camera always
     * follows; there are no bounds to clamp against.
     */
    cameraFollowRate: 6,
  },

  world: {
    /** Deterministic world generation, so a tuning run is reproducible. */
    seed: 1337,
  },

  character: {
    /** World units per second. Should stay comfortably above enemy speeds — */
    /** if he can't outpace the swarm, no amount of clever positioning helps. */
    moveSpeed: 110,
    radius: 15,
    maxHp: 100,

    /**
     * The spellbook he starts a run with, by id from data/weapons.ts.
     *
     * All four for now, so every behaviour in the registry can actually be
     * seen. Once the level-up draft exists in step 6 this drops to the single
     * starter spell and the rest become things you can be offered.
     */
    startingWeaponIds: ['spell_bolt_01', 'spell_nova_01', 'spell_chain_01', 'spell_curse_01'],
  },

  combat: {
    projectileRadius: 5,
    /** Slack on projectile hit tests, so fast bolts don't tunnel past. */
    projectileHitPadding: 4,
    /**
     * How long nova/curse rings and chain arcs stay on screen. Long enough to
     * actually read — at a third of a second a nova is a blink you'll miss,
     * and this is a game you're meant to sit and watch.
     */
    ringVfxSeconds: 0.55,
    lineVfxSeconds: 0.28,
  },

  /**
   * The influence map. (spec 3)
   *
   * These are the numbers we will be adjusting constantly, and they are the
   * whole personality of the character. Nothing here names a behaviour —
   * "cautious" and "greedy" are things you get by moving these, not by
   * writing new code.
   */
  influence: {
    /** Grid resolution. Smaller = finer detail, more cells to fill. */
    cellSize: 30,
    /** Grid is (2n+1) squared, centred on the character. 22 -> 45x45. */
    gridRadiusCells: 22,
    /**
     * Rebuilds per second. Below about 15 he starts reacting to where the
     * swarm used to be. Raise this first if he looks careless.
     */
    updateHz: 30,

    /**
     * Each layer is weight + how far it reaches + the shape of its falloff.
     * Weight is signed: negative repels, positive attracts. Danger is not a
     * special case in the code, it's just a layer with a negative weight.
     *
     * Adding "gold", "health" or "hazard" later means adding an entry here.
     * The runtime focus buttons from the spec are writes to these weights.
     *
     * Falloff shapes: 'sharp' | 'linear' | 'smooth' | 'wide'.
     *
     * Balancing these two is the whole job, and weight alone isn't enough —
     * reach matters just as much. They want opposite shapes.
     *
     * Danger is short and steep: it should scream when he's about to be
     * touched and say nothing from across the field.
     *
     * Value is long and gentle. It's a "come here" signal, and it has to
     * reach him from further away than he can see, or he never learns there
     * is anything worth the trip and simply drifts away forever.
     *
     * A wide radius with a flat-topped falloff is the worst of both: every
     * cell gets the same large positive number, and a uniform field has no
     * gradient to climb. Linear keeps a steady slope all the way out.
     */
    layers: {
      enemyDanger: { weight: -3, radius: 140, falloff: 'sharp' },
      pickupValue: { weight: 1.6, radius: 620, falloff: 'linear' },
    },
  },

  movement: {
    /** Candidate headings tested each frame, evenly spread around him. */
    sampleDirections: 24,
    /**
     * How far along each candidate the map is read. Multiple probes so he can
     * tell "clear ahead" from "clear for one step, then a wall".
     */
    lookAheadDistances: [40, 130, 260],
    /**
     * Bonus for continuing the way he's already going. This is the main
     * anti-dithering control — too low and he vibrates between equally good
     * options, too high and he ploughs on into things he should dodge.
     */
    headingBonus: 0.35,
    /** Radians per second. Lower = wider, more committed turns. */
    turnRateRadPerSec: 7,
  },

  damage: {
    /** Global multiplier over every enemy's contactDamage. */
    contactScale: 1,
  },

  /**
   * PLACEHOLDER. Pickups currently appear out of thin air because nothing can
   * be killed yet; step 4 replaces this with drops from dead enemies. Only the
   * source is temporary — the value layer that pulls him towards them is real.
   */
  pickupScatter: {
    spawnsPerSecond: 0.7,
    maxAlive: 25,
    /** Scatter around a dropping enemy, standing in for a death position. */
    dropJitter: 40,
    /** Fallback ring, used only when nothing is alive to drop anything. */
    minDistance: 160,
    maxDistance: 620,
    collectRadius: 26,
    /** Beyond this he's clearly not coming back for it, so drop it. */
    forgetDistance: 1400,
  },

  spawn: {
    /**
     * Enemies appear on an ellipse around the character, sized from the
     * viewport so they're always just out of sight. 1.42 is the minimum that
     * keeps the diagonals off screen too; above that is breathing room.
     */
    margin: 1.5,
    /** Floor on the spawn ring, so a small window doesn't spawn them in your lap. */
    minRadius: 700,
    /** Random outward variation, so the ring never reads as a visible circle. */
    radiusJitter: 0.25,
    /**
     * Hard ceiling on simulated enemies, whatever the curve asks for.
     *
     * Back up to 400 now that spells kill things — the count rises and falls
     * on its own instead of pegging at the ceiling, so this is a safety limit
     * again rather than the thing setting the difficulty.
     */
    maxAlive: 400,

    /**
     * What happens to enemies the character has left far behind.
     *
     * true  — they wrap to the far side and come at him again, so the horde
     *         keeps surrounding him instead of trailing in one long clump.
     * false — they're deleted. Flip this to compare the two; everything else
     *         about spawning stays identical either way.
     */
    wrapAround: true,

    /**
     * Multiples of the spawn ring at which an enemy counts as left behind.
     * Must stay above 1 + radiusJitter, or freshly spawned enemies qualify
     * as stragglers the instant they appear.
     */
    recycleMultiplier: 1.4,

    /**
     * Sideways scatter applied when an enemy wraps, as a fraction of the
     * spawn ring. Without it a clump that wraps together stays a clump and
     * arrives as a solid wall.
     */
    wrapJitter: 0.3,
  },

  /** Constants behind the formulas in sim/difficulty.ts. (spec 5.3) */
  difficulty: {
    baseSpawnsPerSecond: 1.2,
    spawnGrowthPerMinute: 1.6,
    maxSpawnsPerSecond: 25,

    hpGrowthPerMinute: 0.35,

    speedGrowthPerMinute: 0.05,
    maxSpeedMultiplier: 1.6,
  },

  enemies: {
    /** Bucket size for neighbour lookups. Roughly 2x the largest enemy radius. */
    gridCellSize: 48,
    /**
     * How hard overlapping enemies shove each other apart, 0..1.
     * Low values let the crowd merge into an unreadable blob; 1.0 makes it
     * twitchy. This is a look-at-it-and-decide number.
     */
    separationStrength: 0.6,
  },

  debug: {
    /** Toggle at runtime with F1. */
    showOverlay: true,
    /** The influence map, drawn as a heatmap. Toggle with F2. */
    showHeatmap: false,
    /** The fan of candidate directions and the chosen one. Toggle with F3. */
    showCandidates: false,
    /** Score magnitude that saturates a heatmap cell's colour. */
    heatmapScale: 14,
    /**
     * Seconds on the death screen before a new run starts by itself. Runs use
     * a fixed seed, so an identical run repeats every time — change one weight
     * and the survival time is a real before/after measurement rather than a
     * guess. Set to 0 to require a click.
     */
    autoRestartSeconds: 4,
  },
}
