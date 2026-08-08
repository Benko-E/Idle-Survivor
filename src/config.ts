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
    /** Placeholder wander only. Deleted when the danger map takes over. */
    wanderRange: 600,
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
    /** Hard ceiling on simulated enemies, whatever the curve asks for. */
    maxAlive: 400,
    /** Multiples of the spawn ring at which stragglers are culled. */
    despawnMultiplier: 2.2,
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
  },
}
