/**
 * THE tuning file. (spec 5.4)
 *
 * Every system-level number in the game lives in this one object. If a number
 * describes *how a system behaves* it belongs here. If it describes *a specific
 * piece of content* (this weapon's damage, that enemy's HP) it belongs in a
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

    /**
     * Placeholder scenery for the step-0 visual test only. This exists purely
     * to prove that Y-sorting and camera follow work, and gets deleted once
     * real entities arrive.
     */
    propCount: 90,
    propScatterRadius: 1600,
  },

  character: {
    /** World units per second. */
    moveSpeed: 135,
    radius: 15,
  },

  debug: {
    /** Toggle at runtime with F1. */
    showOverlay: true,
  },
}
