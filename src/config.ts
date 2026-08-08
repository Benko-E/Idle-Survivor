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
      /** "Loot is broadly over there." Long reach, very shallow slope. */
      pickupWide: { weight: 1.6, radius: 620, falloff: 'linear' },
      /** "One is right there, take it." Short reach, steep enough to act on. */
      pickupNear: { weight: 3, radius: 90, falloff: 'sharp' },
      /**
       * "You've just been here." Ground he recently stood on, going sour.
       *
       * This is what stops him settling into a small circle in the middle of
       * the field. Standing still is otherwise a genuine local maximum —
       * everything nearby is equally good, so there's no reason to leave —
       * and no amount of tuning the *other* layers fixes that, because the
       * problem isn't that anywhere is bad, it's that nowhere is better.
       *
       * Note that it devalues the ground, never the globes. A pickup sitting
       * on stale dirt is worth exactly what it was worth.
       *
       * Flip this weight positive and it becomes the "focus on exploring"
       * layer from the spec, with no other changes.
       *
       * MEASURED: this does not fix late-run circling, and turning it up
       * doesn't either — 0.55 and 1.5 both left roam efficiency at 0.06-0.09.
       * The reason is geometric. Penalising the path he is on pushes him
       * *perpendicular* to it, and of the two perpendiculars, inward is
       * empty and safe while outward is the horde. So it tightens his loop
       * rather than breaking it. Kept at a modest weight because it does add
       * some liveliness and it is the groundwork for the explore layer, but
       * it is not the fix for encirclement. See the note on that in the
       * README.
       */
      staleness: { weight: -0.8, radius: 135, falloff: 'smooth' },
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
   * The breadcrumb trail behind him, which feeds the staleness layer.
   *
   * Spacing and memory together decide how big a loop he has to make before
   * it stops feeling stale. Tight circling piles overlapping marks into one
   * spot and makes it genuinely unpleasant; roaming spreads them thin and
   * costs him almost nothing.
   */
  trail: {
    /** How far he must travel before dropping the next mark. */
    spacing: 45,
    /**
     * Seconds until a mark has faded to nothing. Long enough that a full lap
     * of a small circle is still remembered when he comes back round — at 12
     * seconds he outran his own memory and the loop felt fresh again.
     */
    memorySeconds: 20,
    /** Safety ceiling. spacing x this is the longest trail he can lay. */
    maxMarks: 400,
  },

  pickups: {
    /** Base grab radius. Read through the modifier system, so upgradeable. */
    collectRadius: 30,
    /** Beyond this he's clearly not coming back for it, so drop it. */
    forgetDistance: 1400,
    /** Safety ceiling on globes lying around. */
    maxAlive: 400,

    /**
     * Globes piling up combine into bigger ones.
     *
     * This is a fix for the movement AI, not a reward mechanic. Thirty loose
     * globes scattered around the character each pull a little, in thirty
     * directions that cancel, and the centre of the pile becomes the
     * highest-scoring place to stand — so he stops, which is correct by his
     * rules and useless to watch. Merging collapses that into two or three
     * strong attractors that actually point somewhere.
     */
    merge: {
      /** How many combine into one of the next tier up. */
      count: 5,
      /** How close they have to be. The merged globe lands at their centroid. */
      radius: 120,
      /** Merge checks per second. Nothing here needs to run at frame rate. */
      hz: 4,

      /**
       * XP multiplier per tier. Equal to `count` conserves value exactly, so
       * merging is neither a bonus nor a tax — five globes are worth what the
       * five were worth. Raise it above `count` if you want piles to reward
       * patience.
       */
      xpPerTier: 5,

      /**
       * Pull multiplier per tier. Deliberately far below xpPerTier: a tier 2
       * globe is worth 25x a Spark but only shouts about 5x as loud. Raise
       * this and he'll cross the map through anything to reach one.
       */
      pullPerTier: 2.2,

      /** Draw size multiplier per tier. Cosmetic. */
      sizePerTier: 1.3,

      /** Backstop against a runaway tier ladder. */
      maxTier: 10,
    },
  },

  drops: {
    /**
     * Multiplies every drop chance in every enemy's table at once.
     * "XP drops too often" is this number, not thirty edits.
     */
    chanceScale: 1,
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
     * How close he has to come to a globe for leaving it to count as a miss.
     * Purely a measurement — see the "missed" readout in the debug panel.
     */
    nearMissDistance: 70,
    /**
     * Seconds on the death screen before a new run starts by itself. Runs use
     * a fixed seed, so an identical run repeats every time — change one weight
     * and the survival time is a real before/after measurement rather than a
     * guess. Set to 0 to require a click.
     */
    autoRestartSeconds: 4,
  },
}
