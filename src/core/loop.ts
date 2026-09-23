/**
 * Fixed-timestep game loop.
 *
 * The simulation always advances in constant 1/60s slices regardless of the
 * display's refresh rate. This matters here more than in most games: the
 * movement AI is a feedback loop, and a feedback loop fed a variable timestep
 * behaves differently on a 60Hz laptop than a 144Hz monitor. Tuning would not
 * transfer between machines.
 *
 * Rendering still happens once per animation frame, as often as the display
 * allows.
 */

export const FIXED_DT = 1 / 60

/** Never simulate more than this much time in one frame (e.g. after alt-tab). */
const MAX_FRAME_TIME = 0.25

export const stats = {
  fps: 0,
  /** Simulation steps run during the last rendered frame. */
  stepsLastFrame: 0,
  /** Frames that threw. Non-zero means something is wrong; check the console. */
  errors: 0,
}

/** Each distinct error is logged once, not sixty times a second. */
const reported = new Set<string>()

function report(error: unknown): void {
  stats.errors++
  const key = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (reported.has(key)) return
  reported.add(key)
  console.error('Frame failed; the game will keep running.', error)
}

export function startLoop(update: (dt: number) => void, render: () => void): void {
  let previous = performance.now() / 1000
  let accumulator = 0

  let fpsFrames = 0
  let fpsElapsed = 0

  function frame(nowMs: number): void {
    // Scheduled first, not last. It used to sit at the bottom, so a single
    // thrown error anywhere in a frame meant the next frame was never asked
    // for and the game froze until a refresh — which is exactly what dragging
    // a debug slider to a fractional direction count did.
    requestAnimationFrame(frame)

    const now = nowMs / 1000
    let elapsed = now - previous
    previous = now
    if (elapsed > MAX_FRAME_TIME) elapsed = MAX_FRAME_TIME

    accumulator += elapsed

    try {
      let steps = 0
      while (accumulator >= FIXED_DT) {
        update(FIXED_DT)
        accumulator -= FIXED_DT
        steps++
      }
      stats.stepsLastFrame = steps
    } catch (error) {
      // Drop the backlog, or a step that throws every time would be retried
      // in a tight loop on every frame after.
      accumulator = 0
      report(error)
    }

    // Guarded separately, so a broken simulation still gets drawn — including
    // the error count in the debug overlay — rather than freezing on the last
    // good frame, which looks identical to a hang.
    try {
      render()
    } catch (error) {
      report(error)
    }

    fpsFrames++
    fpsElapsed += elapsed
    if (fpsElapsed >= 0.5) {
      stats.fps = fpsFrames / fpsElapsed
      fpsFrames = 0
      fpsElapsed = 0
    }
  }

  requestAnimationFrame(frame)
}
