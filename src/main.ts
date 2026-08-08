import { config } from './config'
import { startLoop, stats } from './core/loop'
import { makeRng, pointInCircle, range } from './core/rng'
import { Renderer, type Drawable } from './render/renderer'

/**
 * STEP 0 — skeleton only.
 *
 * There is no game here yet. This exists to prove four things work before we
 * build anything on top of them:
 *
 *   1. the fixed-timestep loop runs at a steady 60 simulation steps/sec
 *   2. sprites sort back-to-front by world Y (the 2.5D effect)
 *   3. the camera follows smoothly through an endless, unbounded world
 *   4. `npm run dev` and the one-file build both actually work on your machine
 *
 * The wandering box and the scenery both get deleted in step 1, when real
 * enemies arrive.
 */

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.')

const renderer = new Renderer(canvas)
const rng = makeRng(config.world.seed)

// --- placeholder scenery -----------------------------------------------------

const scenery: Drawable[] = []
for (let i = 0; i < config.world.propCount; i++) {
  const p = pointInCircle(rng, config.world.propScatterRadius)
  const shade = Math.round(range(rng, 46, 74))
  scenery.push({
    x: p.x,
    y: p.y,
    w: range(rng, 14, 26),
    h: range(rng, 40, 96),
    colour: `rgb(${shade}, ${shade + 12}, ${shade + 6})`,
  })
}

// --- the character -----------------------------------------------------------

const character = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
}

function pickNewWanderTarget(): void {
  // Deliberately dumb. This is a placeholder for the danger map (step 2), which
  // is what will actually decide where he goes.
  const p = pointInCircle(rng, 600)
  character.targetX = character.x + p.x
  character.targetY = character.y + p.y
}
pickNewWanderTarget()

function update(dt: number): void {
  const dx = character.targetX - character.x
  const dy = character.targetY - character.y
  const distance = Math.hypot(dx, dy)

  if (distance < 8) {
    pickNewWanderTarget()
  } else {
    const step = config.character.moveSpeed * dt
    character.x += (dx / distance) * step
    character.y += (dy / distance) * step
  }

  // Exponential smoothing towards the character. Written this way rather than
  // as a plain lerp so the follow speed is identical no matter the timestep.
  const k = 1 - Math.exp(-config.render.cameraFollowRate * dt)
  renderer.camera.x += (character.x - renderer.camera.x) * k
  renderer.camera.y += (character.y - renderer.camera.y) * k
}

// --- rendering ---------------------------------------------------------------

let showOverlay = config.debug.showOverlay
window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    showOverlay = !showOverlay
  }
})

function render(): void {
  renderer.beginFrame()

  // Rebuilt every frame on purpose: the draw list is throwaway output, never
  // the source of truth. The simulation owns the entities; the renderer only
  // ever receives a flat description of what to paint.
  const frame: Drawable[] = scenery.slice()
  frame.push({
    x: character.x,
    y: character.y,
    w: config.character.radius * 2,
    h: config.character.radius * 3.4,
    colour: '#e8c468',
  })

  renderer.drawScene(frame)

  if (showOverlay) {
    renderer.drawOverlay([
      `fps          ${stats.fps.toFixed(0)}`,
      `sim steps    ${stats.stepsLastFrame}`,
      `drawn        ${frame.length}`,
      `character    ${character.x.toFixed(0)}, ${character.y.toFixed(0)}`,
      `F1           toggle this panel`,
    ])
  }
}

startLoop(update, render)
