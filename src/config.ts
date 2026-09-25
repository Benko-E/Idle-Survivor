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
    /** The measuring grid. Useful for debugging, noise once there's ground art. */
    showGrid: false,

    /**
     * The ground. Tiles are scattered by a hash of their world position, so
     * the field never repeats and yet is identical every time you look at it.
     *
     * The strip holds plain grass first and detail tiles after; detailChance
     * decides how often a tile comes from the detail group. Push it up and the
     * meadow turns to confetti.
     */
    groundTileSize: 16,
    groundPlainTiles: 4,
    groundDetailChance: 0.06,
    /**
     * Tiles per side of a cached chunk. Chunks are drawn once to an offscreen
     * canvas and then blitted, which turns a few thousand tile draws per frame
     * into about twenty.
     */
    groundChunkTiles: 16,

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
    visibleWorldHeight: 820,

    /**
     * Black laid over the ground tile, 0..1.
     *
     * The grass is bright and saturated at full strength, and sprites drawn on
     * top of it fight for attention. Knocking the floor back a third makes the
     * things that matter pop without touching the art.
     */
    groundShade: 0.32,
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
    /**
     * World units per pixel of pixel art, so props, poses and effects sit at
     * the same scale as the hero: his 36-pixel frame is drawn 46 units tall.
     */
    pixelScale: 46 / 36,
    /**
     * World units per pixel of enemy art. One figure for all of them, so their
     * sizes relative to each other are the artist's; smaller than the hero's
     * pixelScale because a horde of full-size crabs would bury him.
     */
    enemyPixelScale: 0.7,
    /**
     * How high fliers are drawn off the ground, in world units, and how far
     * they bob. Their shadow stays on the ground under them.
     */
    flightHeight: 16,
    flightBob: 3,
    /** Enemy feedback, all render-side. */
    enemyFx: {
      /** A white flash on a direct hit. Damage over time doesn't flash. */
      flashSeconds: 0.12,
      /** Squash, flash and fade on death, with a puff of dust. */
      deathSeconds: 0.35,
      /** Fading in when it appears, so nothing pops into view. */
      spawnFadeSeconds: 0.3,
    },
    /** Seconds his spellbook pose plays for when a big spell goes off. */
    castPoseSeconds: 0.45,
    /** Only spells with at least this recharge trigger the pose. */
    castPoseMinCooldown: 2,
    /**
     * Degrees past a diagonal a heading must go before a sprite switches to
     * the next of its four facings. Without it, walking near a diagonal flips
     * the sprite back and forth and reads as stutter-stepping.
     */
    facingSlackDegrees: 15,
    /**
     * How loud every spell effect is drawn, 0 to 1: rings, bolts, zones,
     * auras. The knob for when a big build turns into a light show — the
     * spells keep working exactly the same underneath.
     */
    effectsAlpha: 1,

    /** Numbers floating off enemies as they take damage. */
    damageNumbers: {
      enabled: true,
      /**
       * Hits on one enemy within this many seconds become one number. Damage
       * over time lands every frame, so without this a burning crowd would
       * be a fountain of digits.
       */
      mergeSeconds: 0.6,
      /** Seconds a number stays up. */
      lifetime: 0.8,
      /** Screen pixels, before bigger hits grow it a little. */
      fontSize: 15,
      /** World units above the enemy's feet where a number starts. */
      headHeight: 34,
      /** How far it floats up over its life, in world units. */
      rise: 26,
      /** Random sideways offset, so simultaneous numbers don't stack. */
      scatter: 14,
      /** Past this many on screen, the oldest are dropped. */
      maxOnScreen: 80,
      /** Merged totals below this aren't shown at all. */
      minShown: 0.5,
    },
  },

  world: {
    /**
     * Every run gets a fresh seed — different spawns, different drafts. Turn
     * this off to replay `seed` exactly, which is what before/after tuning
     * needs: change one number, and the difference in the run is that number.
     */
    randomSeed: true,
    /**
     * The seed used when `randomSeed` is off. The F1 overlay shows each run's
     * seed, so a run worth replaying can be copied here.
     */
    seed: 1337,
  },

  character: {
    // His own numbers — speed, size, health, regeneration, look — are on his
    // class, in data/classes.ts. What's here is shared by every class.
    /** World units travelled per walk frame. Lower = faster footsteps. */
    stepLength: 22,

    /**
     * Extra spells handed out at the start of every run on top of the pick.
     * Empty for real play; add ids here to test a spell in isolation.
     */
    startingWeaponIds: [] as string[],
  },

  /**
   * Spells that want enemies in a shape around him — an aura's burning band,
   * later a breath's cone — and how hard he tries to keep them there. See
   * sim/engagement.ts.
   */
  engage: {
    /** The shape's inner edge, as a multiple of his own radius: his elbow room. */
    bubble: 1.2,
    /** Per enemy in the shape, before the spell's own `engage`. The point of it all. */
    weight: 1,
    /** How far ahead along a candidate direction he judges it from. */
    lookAhead: [40, 100],
    /** Soft edges: world units across the shape's rim, radians across a cone's sides. */
    edge: 14,
    edgeAngle: 0.25,
    /** Enemies count for less than their number past about this many. */
    softCap: 10,
    /** Full keenness above this share of his health, none below `fadeTo`. */
    fadeFrom: 0.6,
    fadeTo: 0.3,
  },

  /** Aura spells — Righteous Fire. The upgrade numbers are on the upgrades; these are the rules. */
  aura: {
    /** Zealot's Pyre goes out below this share of his health, and is relit at this one. */
    pyreOffAt: 0.3,
    pyreOnAt: 1,
    /** Feed the Flames: seconds each kill adds, the most it can bank, the biggest the aura can grow. */
    feedSeconds: 1.5,
    feedMaxSeconds: 6,
    feedMaxBonus: 0.6,
    /** How quickly the fed radius eases towards where it's heading. Higher is snappier. */
    feedEase: 3,
    /** How long Beacon's vulnerability outlasts the last tick of the aura. */
    beaconSeconds: 0.6,
    /** Zealotry's little auras: reach as a multiple of the carrier's size, and their share against him. */
    zealotryReach: 1.5,
    zealotryToHim: 0.35,
  },

  combat: {
    projectileRadius: 5,
    /** Plain bolts — forks, Backdraft — are this much of a normal bolt's size. */
    plainBoltSize: 0.75,
    /** A fork hits for this much of the bolt it split from, and looks this far for a target. */
    forkDamage: 0.5,
    forkRange: 200,
    /** Fireball's blast: this much of the hit's damage to everything around the target. */
    explodeDamage: 0.6,
    /** Ignite's burn lasts this long; its strength is the upgrade's share of the hit, spread over it. */
    igniteSeconds: 3,
    /** Combustion's explosion, and the most it chains through a burning crowd from one hit. */
    combustionRadius: 45,
    combustionChain: 10,
    /** Hot Streak's empowered bolt: damage and size multiplier, and how far it flies. */
    hotStreakDamage: 2,
    hotStreakSize: 1.9,
    hotStreakRange: 700,
    /** Backdraft goes off at most this often. */
    backdraftCooldown: 4,
    /** Phoenix Bolt's trail: a patch every this far, this big, lasting this long, burning this long after. */
    trailSpacing: 26,
    trailRadius: 22,
    trailSeconds: 2,
    trailBurnSeconds: 1.2,
    /** Slack on projectile hit tests, so fast bolts don't tunnel past. */
    projectileHitPadding: 4,
    /**
     * How long nova/curse rings and chain arcs stay on screen. Long enough to
     * actually read — at a third of a second a nova is a blink you'll miss,
     * and this is a game you're meant to sit and watch.
     */
    ringVfxSeconds: 0.55,
    lineVfxSeconds: 0.28,
    /**
     * How soon a spell that found nothing in range looks again. Short enough
     * that it fires almost as soon as something walks in, long enough that
     * four idle spells aren't querying the grid every single frame.
     */
    retrySeconds: 0.1,
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
     * next to soured ground — so a character who can see past the edge of his
     * own map will run at it forever, chasing an artefact. It also bounds how
     * far away loot can be and still call him: the flow can't route from a
     * cell that doesn't exist.
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
      /**
       * What each pickup is worth as a destination, times its pull.
       *
       * This is the whole of the long-range "there's loot over there" signal.
       * It used to be a wide blob stamped straight onto the map as well, and
       * that blob was felt along every straight line — including the one
       * through the middle of a pack. Measured over six seeded runs, it was
       * most of why he dived into mobs: removing it took damage taken from 28
       * to 4 hp a minute. Routed only, loot reaches him around danger or not
       * at all.
       */
      pickupValue: 7,
    },

    /**
     * How much enemies near a pickup mute its short-range "grab me" pull.
     *
     * Loot drops where enemies die, which is where the rest of the pack is
     * still standing — so an unmuted pickup pull is a pull into the crowd.
     * Higher makes him leave guarded pickups for later; 0 treats a coin in
     * a mob exactly like one lying in the open.
     */
    guardFear: 3,
    /**
     * How much scarier enemies look to him as he gets hurt. At full health
     * danger counts as normal; with none left it counts as 1 + this.
     *
     * He used to walk a bank trip at 6 hp exactly as he would at full, which
     * is how most runs ended. Together with base regeneration, this took
     * deaths before 20:00 from 10 of 12 bot runs to 2 of 12 — and banked
     * gold per minute nearly doubled, because a live wizard banks.
     *
     * The same kind of knob as the planned focus buttons: a runtime scale on
     * a layer's weight, no new behaviour.
     */
    hurtFear: 2,

    /**
     * How strongly danger tied to a place is stamped, next to an enemy's
     * dangerWeight: gas on the ground, a lit fuse, the lane a charge is about
     * to run down.
     */
    hazardFear: 2.5,

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
      /**
       * "One is right there, take it." Short reach, steep enough to act on.
       * The long-range pull is `flow.pickupValue`, not a layer — see there.
       */
      pickupNear: { weight: 5, radius: 90, falloff: 'sharp' },
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
       * "Don't walk into that tree." Radius is added to each obstacle's own,
       * so a big trunk pushes further. Short: the flow does the routing,
       * this only keeps the steering from brushing past bark.
       */
      obstacle: { weight: -2.5, radius: 30, falloff: 'sharp' },

      /**
       * "You're carrying enough to be worth a trip." Also applied per cell,
       * because the shop is usually nowhere near him — stamping a blob at a
       * point 1500 units away would land entirely outside the grid and pull
       * on nothing at all.
       *
       * This is the thing every other attempt was missing: a reason to be
       * somewhere else. A penalty can make where he stands unpleasant, but it
       * cannot invent a destination, and he was correct to stay put while all
       * the value in the world sat under his feet.
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
     * They were stretched to 560 because a uniform penalty across everything
     * he could see is a constant that changes no comparison, so he needed to
     * see past it. But long straight probes have their own failure:
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
   * The bank: a single square somewhere on the map that he walks to once he's
   * carrying enough. Arriving deposits his carried gold, which is then kept
   * between runs; whatever he's still carrying when he dies is lost.
   *
   * It began as an experiment in giving him a destination outside the loot
   * cloud. Camping penalties, longer sight and stronger weights can all make
   * standing still unpleasant, but none of them can invent somewhere to go,
   * and he was right to stay while every scrap of value sat under his feet.
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
     * ...or about this many minutes of his income, whichever is more, so a
     * rich build doesn't spend its whole run walking to the shop. 0 turns it
     * off and the threshold is always spendThreshold. Measured with
     * Righteous Fire's kit, three 10-minute runs: coins left behind 35 -> 2,
     * gold earned +46%; runs earning under 60 a minute are unchanged.
     */
    thresholdMinutes: 1,
    /**
     * ...stretching to this many minutes while he's doing well: fully above
     * `confidentAbove` of his health, not at all below `nervousBelow`. Set it
     * equal to thresholdMinutes to turn it off. Measured with Firebolt and
     * Righteous Fire, eight 10-minute runs taking a card each level: at 1 he
     * spent 40% of the run banking and farmed 37s between trips; at 3, 22%
     * and 83s, +10% fire damage, +9% kills, +14% banked, same deaths (1/8).
     * At 4 three of the eight died. Firebolt alone barely changes.
     */
    confidentMinutes: 3,
    confidentAbove: 0.8,
    nervousBelow: 0.4,
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
     * What the long-range loot signal (`flow.pickupValue`) is worth while
     * he's on a banking run.
     *
     * Turned down so a cluster off to one side can't restart the argument he
     * has already settled. The short-range pickup layer is untouched, so he
     * still takes whatever he walks over — he just stops detouring for it.
     */
    bankingLootScale: 0.25,
    /**
     * Cap on eagerness, in multiples of the threshold.
     *
     * The shop's pull is a straight line — it doesn't route around danger the
     * way loot does — so how hard it can pull decides whether a trip is a
     * walk or a march through the horde. At 6 it was a march: every run with
     * a real build died on a bank trip by 7:30, because more spells meant more
     * kills, more gold and fuller pockets. Measured over four seeded runs to
     * 15:00: at 6 none survived, at 3 one, at 2 three, at 1.5 all four — with
     * the most gold banked, 7-11 trips a run. At 1 he dawdles with a full
     * pocket and dies holding it.
     *
     * It was 6 to stop loot outbidding the trip forever, which it did back
     * when loot pulled in straight lines too. Routed loot, turned down while
     * banking, no longer can. Routing the shop through the flow as well was
     * tried and banked less and died more — a gentle straight pull that he
     * dodges around beats a strong routed one.
     */
    maxEagerness: 1.5,
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
     * Enemies appear on an ellipse around the character, just out of sight.
     * 1.42 is the minimum that keeps the diagonals off screen too; above that
     * is breathing room.
     */
    margin: 1.5,
    /**
     * The window shape the spawn ring is sized for, width over height. Any
     * window up to this shape gets an identical ring and so an identical run
     * from the same seed; a wider one falls back to its real size so enemies
     * never pop in on screen. 2.4 covers 21:9 ultrawides with room to spare.
     *
     * Also a difficulty knob in disguise: lower brings side spawns closer, so
     * the horde arrives sooner on narrow screens.
     */
    designAspect: 2.4,
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
    /** Options offered per level-up. Upgrades only — spells come in tiers. */
    choices: 3,
    /**
     * The level spell evolutions start being offered at. Each spell's are
     * exclusive: take one and the others are gone for the run.
     */
    evolutionLevel: 20,
    /**
     * What each card slot leans towards, left to right. Names from
     * `slotThemes`; anything else (like 'any') leans nowhere.
     */
    slots: ['fight', 'any', 'comfort'],
    /** Which upgrade tags each theme draws from. */
    slotThemes: {
      fight: ['offence', 'defence'],
      comfort: ['utility'],
    },
    /**
     * How often a slot keeps to its theme, 0 to 1. At 1 the left card is
     * always a fighting card; at 0 the slots mean nothing. A lean rather than
     * a rule, so the draft still surprises.
     */
    slotBias: 0.75,
    /**
     * Every level-up reserves a card for each of his spells that has an
     * upgrade to offer, leaving this many cards free for anything else.
     */
    openSlots: 1,
  },

  /** His thought bubble. The lines are in data/thoughts.ts. */
  thoughts: {
    enabled: true,
    /** Seconds a thought stays up, plus a little for long lines. */
    showSeconds: 3.2,
    /** Least time between any two thoughts, so he isn't a chatterbox. */
    minGapSeconds: 9,
    /** The same for the big moments: a new spell, a close call, dying. */
    urgentGapSeconds: 2,
    /** Quiet for this long, and he muses about something. */
    idleSeconds: 45,
  },

  /** Trees and other things standing in the world. See sim/obstacles.ts. */
  obstacles: {
    enabled: true,
    /** Size of the squares obstacles are scattered over; at most one each. */
    cellSize: 150,
    /** Average chance a square has one. */
    density: 0.32,
    /**
     * How much density swings between groves and clearings, 0 to 1. At 0 the
     * trees are an even sprinkle; at 1 thick groves sit beside open meadows.
     */
    groveContrast: 0.9,
    /** Squares across one swing from grove to clearing. */
    groveSize: 5,
    /** Kept clear around where a run starts, in world units. */
    clearStart: 260,
    /** Kept clear around the shop, so the camp always has its meadow. */
    clearShop: 240,
    /** How hard enemies slide sideways round a trunk instead of stopping. */
    enemySlide: 0.6,
  },

  /**
   * Rewards for how the three spells fit together. See sim/buildBonus.ts.
   * Two of one element and one other earns nothing — that's the decision.
   */
  buildBonus: {
    /** All one element: extra damage and burn for that element. */
    pureDamage: 0.25,
    /**
     * One of each, Elemental Equilibrium: extra damage an enemy takes from
     * an element other than the one that last hit it.
     */
    equilibriumBonus: 0.3,
    /** How long that mark lasts, in seconds. */
    equilibriumSeconds: 3,
  },

  /** How spells are gained. See sim/spellTiers.ts. */
  spells: {
    /**
     * The level each tier after the first opens at: tier 2 at the first
     * entry, tier 3 at the second. Add an entry and a tier 4 exists — give
     * some spells `tier: 4` and it's offered.
     */
    tierLevels: [6, 15],
  },

  /** Constants behind the formulas in sim/difficulty.ts. (spec 5.3) */
  difficulty: {
    baseSpawnsPerSecond: 1.2,
    spawnGrowthPerMinute: 1.6,
    maxSpawnsPerSecond: 25,

    hpGrowthPerMinute: 0.35,
    /**
     * The late game. Before this minute the curve is as above; after it,
     * enemies also get tougher faster and start hitting harder.
     *
     * Without it a run that survived the middle never ended. From about
     * minute 16 he was killing everything the spawner could produce — the
     * spawn rate and alive caps set a ceiling on pressure — and his health
     * went *up* over time. Eight of nine bot runs were still going at 40:00.
     *
     * Starting late leaves the first twelve minutes alone, because they
     * already played well. Measured over fifteen bot runs to 40:00, with the
     * spell changes from the same pass: median 27.7 minutes, most between 20
     * and 30, none dead before 10, and four exceptional builds of fifteen
     * still standing at the end.
     */
    lateStartMinutes: 12,
    /** Added to the HP multiplier per late minute, squared: +3.6 at 20:00, +23 at 28:00. */
    lateHpPerMinuteSquared: 0.09,
    /** Added to contact damage per late minute: x2.4 at 20:00, x3.9 at 28:00. */
    lateDamagePerMinute: 0.18,

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
    /**
     * Blasts (fire wisps, sporelings) hurt other enemies too, at this times
     * their damage to him, scaled like enemy health so it keeps up with the run.
     */
    blastEnemyScale: 1,
  },

  debug: {
    /**
     * The live-state readout. Off by default now the debug panel exists —
     * they show different things (this is what the run is doing, the panel is
     * what the knobs are set to), so it's toggled rather than deleted. F1.
     */
    showOverlay: false,
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
     * Skip the menu and start a new run by itself this many seconds after
     * death. 0 (the default) means off: death goes back to the menu.
     *
     * For leaving tuning sessions unattended. With `world.randomSeed` off,
     * an identical run repeats every time — change one weight and the
     * survival time is a real before/after measurement rather than a guess.
     */
    autoRestartSeconds: 0,
  },

  menu: {
    /**
     * How long the death banner stays up before the menu opens by itself.
     * A click skips the wait.
     */
    afterDeathSeconds: 4,
  },
}
