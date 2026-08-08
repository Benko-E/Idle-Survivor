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
}

export function startLoop(update: (dt: number) => void, render: () => void): void {
  let previous = performance.now() / 1000
  let accumulator = 0

  let fpsFrames = 0
  let fpsElapsed = 0

  function frame(nowMs: number): void {
    const now = nowMs / 1000
    let elapsed = now - previous
    previous = now
    if (elapsed > MAX_FRAME_TIME) elapsed = MAX_FRAME_TIME

    accumulator += elapsed

    let steps = 0
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT)
      accumulator -= FIXED_DT
      steps++
    }
    stats.stepsLastFrame = steps

    render()

    fpsFrames++
    fpsElapsed += elapsed
    if (fpsElapsed >= 0.5) {
      stats.fps = fpsFrames / fpsElapsed
      fpsFrames = 0
      fpsElapsed = 0
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
