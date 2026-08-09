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

    /**
     * How much world is visible top to bottom, in world units, whatever the
     * window is doing. The renderer scales to fit this rather than mapping a
     * world unit to a screen pixel.
     *
     * Lower = a closer, more claustrophobic view with bigger sprites.
     */
    visibleWorldHeight: 1150,
    /** Clamps, so a freakishly shaped window can't produce absurd sprites. */
    minScale: 0.4,
    maxScale: 2.5,

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
     * Just the starter now that the draft exists — the rest are things you
     * can be offered. Add ids back here to test a behaviour in isolation.
     */
    startingWeaponIds: ['spell_bolt_01'],
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
    /**
     * Grid is (2n+1) squared, centred on the character. 30 -> 61x61, which is
     * 900 world units in every direction.
     *
     * This has to comfortably exceed the furthest look-ahead distance. Outside
     * the grid every read returns a neutral zero, and zero looks *attractive*
     * next to a soured camping zone — so a character who can see past the edge
     * of his own map will run at it forever, chasing an artefact.
     */
    gridRadiusCells: 30,
    /**
     * Rebuilds per second. Below about 15 he starts reacting to where the
     * swarm used to be. Raise this first if he looks careless.
     */
    updateHz: 30,

    /**
     * The flow pass. Floods reward outward so it travels around danger
     * instead of through it, which is what lets him find a route rather than
     * judging every direction by what sits on the straight line.
     *
     * With this on, long look-ahead probes stop being necessary — the routing
     * information is baked into the field at every point, so a short probe
     * already knows about a globe three hundred units away behind a pack.
     */
    flow: {
      /**
       * Raster sweeps per rebuild. Each one carries information the whole
       * length of the grid in its own direction; four covers all of them.
       */
      sweeps: 4,
      /**
       * Value retained per cell crossed. Sets how far a reward's pull
       * carries: at 0.96 over 30-unit cells it's down to a third after
       * roughly 900 units.
       */
      decay: 0.96,
      /**
       * How hard danger constricts value flowing through a cell. Higher makes
       * him treat packs as solid walls and insist on going around; lower lets
       * value seep through and he'll consider barging past.
       */
      hazardResistance: 0.15,
      /** Floor, so a fully enclosed pocket still has some gradient in it. */
      minPassability: 0.02,
      /** How much the routed field counts against the raw local one. */
      weight: 1,
    },

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

      /**
       * "You have been standing here far too long." Applied per cell from the
       * occupancy grid rather than stamped, so radius and falloff don't apply.
       *
       * Sized from measurement, not taste. Standing in the middle of his loop
       * scored +4.5 while open ground 400 away scored +2 to +5 — a coin flip,
       * which is exactly why he never left. This has to be large enough to
       * turn a thoroughly camped patch decisively negative, so it wins the
       * comparison outright instead of nudging it.
       */
      camping: { weight: -12, radius: 0, falloff: 'linear' },

      /**
       * "You're carrying enough to be worth a trip." Also applied per cell,
       * because the shop is usually nowhere near him — stamping a blob at a
       * point 1500 units away would land entirely outside the grid and pull
       * on nothing at all.
       *
       * This is the thing every other attempt was missing: a reason to be
       * somewhere else. Camping pressure can make where he stands unpleasant,
       * but it cannot invent a destination, and he was correct to stay put
       * while all the value in the world sat under his feet.
       */
      shop: { weight: 14, radius: 0, falloff: 'linear' },
    },
  },

  movement: {
    /** Candidate headings tested each frame, evenly spread around him. */
    sampleDirections: 24,
    /**
     * How far along each candidate the map is read. Multiple probes so he can
     * tell "clear ahead" from "clear for one step, then a wall".
     *
     * Short again, now that the flow pass exists.
     *
     * They were stretched to 560 because a uniform camping penalty across
     * everything he could see is a constant that changes no comparison, so he
     * needed to see past it. But long straight probes have their own failure:
     * they average over terrain the route would avoid, and they overshoot
     * anything nearby — which is why he walked past shops he wanted, three of
     * his four probes landing beyond the door where the value drops again.
     *
     * The flow field carries the long-range information now, baked into every
     * cell, so a short probe already knows what's reachable far away. Probes
     * are back to doing the one job they're good at: local dodging.
     */
    lookAheadDistances: [40, 120, 230],

    /**
     * Importance of each probe, matched by position to the distances above.
     *
     * Near probes count for more. The far ones exist to answer "is there any
     * reason to go that way", and letting them weigh as much as the near ones
     * would dilute the close-range detail he dodges with — which is the real
     * cost of longer sight, and the reason to weight rather than just extend.
     */
    lookAheadWeights: [1, 0.8, 0.6],
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
  /**
   * TEMPORARY SCAFFOLDING.
   *
   * A single square somewhere on the map that he walks to once he's carrying
   * enough. There is no gold, no shop inventory and nothing to buy — arriving
   * simply zeroes what he's carrying. It exists to answer one question: does
   * giving him a destination outside the loot cloud make him travel?
   *
   * Every previous attempt failed for the same reason. Camping penalties,
   * longer sight and stronger weights can all make standing still unpleasant,
   * but none of them can invent somewhere to go, and he was right to stay
   * while every scrap of value sat under his feet.
   *
   * When gold and real shops exist this becomes a proper system. If the
   * experiment doesn't work it gets deleted and we do pathfinding instead.
   */
  shop: {
    enabled: true,
    /**
     * How far away it's placed, and re-placed after each visit.
     *
     * 1500 was too far to survive. Measured mid-run: distance to the shop went
     * 1757 → 1801 → 1593 → 1736 → 1456 → 1381 while he travelled 2750 units,
     * because dodging a hundred-strong horde eats most of the progress. He
     * committed, set off, and died on the way. Far enough to be a journey,
     * close enough to finish one.
     */
    distanceFromStart: 900,
    /** How close he must get to count as arrived. */
    radius: 70,
    /**
     * Carried value that makes the trip worth making.
     *
     * Has to be reachable well inside a run. At 100 he was on 63 by 1:29 and
     * dead by 2:35 — he crossed the line with seconds to spare, or never, so
     * the whole feature sat inert and every measurement of it was measuring
     * nothing happening.
     *
     * Too low is its own failure: at 35 he topped up in seconds and simply
     * camped next to the shop instead, three visits without ever getting more
     * than 581 units away. It wants to be far enough that filling up means
     * farming somewhere other than the doorstep.
     */
    spendThreshold: 60,
    /**
     * How far he must travel towards the shop to gain `layers.shop.weight`
     * points of score, at eagerness 1.
     *
     * Expressed as a constant slope rather than a blob fading over some
     * range, because the pull has to feel identical whether the shop is 200
     * units away or 3000. A ramp spread over a fixed range is inherently
     * gentle at distance, and gentle loses: measured against the loot glow,
     * which is worth 14 under his feet and 4 a step away, a polite pull is
     * simply ignored.
     */
    gradientLength: 1000,
    /**
     * What the long-range loot signal is worth while he's on a banking run.
     *
     * Turned down so a cluster off to one side can't restart the argument he
     * has already settled. The short-range pickup layer is untouched, so he
     * still takes whatever he walks over — he just stops detouring for it.
     */
    bankingWideScale: 0.25,
    /**
     * Cap on eagerness, in multiples of the threshold.
     *
     * Deliberately high, because the cap is what makes him get stuck. At 1.6
     * he was observed carrying 250 against a threshold of 60 while a globe
     * cluster outbid the trip — "I'm loaded" had become a plateau instead of
     * mounting pressure, so nothing changed no matter how long he ignored it.
     *
     * Letting it climb means the longer he puts the trip off the more
     * irresistible it becomes, so being stuck is self-correcting rather than
     * permanent. Still capped so a freak hoard can't send him sprinting
     * blindly through a wall of Hulks.
     */
    maxEagerness: 6,
    drawSize: 46,
  },

  /**
   * Dwell time per patch of ground, feeding the `camping` layer.
   *
   * The knobs together answer "how long may he loiter, and how long must he
   * stay away before it's forgiven".
   */
  occupancy: {
    /** Size of a patch. Roughly how precisely "here" is defined. */
    cellSize: 60,
    /** Seconds of dwell in one patch before it's as bad as it gets. */
    saturationSeconds: 4,
    /**
     * Seconds for a patch to forget half of what it remembers. This is what
     * lets him come back later — which he needs to, because globes keep
     * dropping on ground he abandoned.
     */
    halfLifeSeconds: 20,
    /** Cells below this many remembered seconds get dropped. */
    pruneBelow: 0.05,
    maxCells: 800,
  },

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
    /**
     * Beyond this he's clearly not coming back for it, so drop it.
     *
     * Has to comfortably exceed the shop distance. At 1400 a trip to a shop
     * 1500 away quietly deleted every globe he left behind, so there was
     * nothing to come back for and the return leg never happened.
     */
    forgetDistance: 3200,
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
       * Gold multiplier per tier. Equal to `count` conserves value exactly, so
       * merging is neither a bonus nor a tax — five piles are worth what the
       * five were worth. Raise it above `count` if you want hoards to reward
       * patience.
       */
      goldPerTier: 5,

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

  /**
   * The XP curve. (spec 4, spec 5.3)
   *
   * XP needed to leave level n is baseXp * n^exponent — a formula, never a
   * table, so changing the shape moves every level at once.
   *
   * At these values a ~2:30 run reaching roughly 450 kills lands around level
   * 8, which is enough level-ups for a draft to feel like a build rather than
   * a single decision.
   */
  progression: {
    baseXp: 14,
    exponent: 1.45,
  },

  /**
   * The level-up draft. (spec 4)
   *
   * It does not pause the game. Pausing exists to protect a player who would
   * otherwise die mid-decision, and nobody here is under that pressure — the
   * character fights on unsupervised. Levels queue on a button instead.
   */
  draft: {
    /** Options offered per level-up. */
    choices: 3,
    /** Ceiling on spells carried at once, so a build stays a build. */
    maxWeapons: 6,
    /**
     * Weight of "a new spell" against a single upgrade. Higher than any
     * upgrade because a whole new spell is worth more than an increment.
     */
    newWeaponWeight: 130,
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
    /**
     * Floor on the heatmap's auto-scale. The overlay stretches to whatever
     * range is on screen; this stops a genuinely flat field being amplified
     * into dramatic-looking noise.
     */
    heatmapMinScale: 2,
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
