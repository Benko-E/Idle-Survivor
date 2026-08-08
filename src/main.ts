import { config } from './config'
import { startLoop, stats } from './core/loop'
import { pointInCircle } from './core/rng'
import { Renderer, type Drawable } from './render/renderer'
import { hpMultiplier, spawnsPerSecond } from './sim/difficulty'
import { updateEnemies } from './sim/enemyMovement'
import { updateSpawner } from './sim/spawner'
import { createWorld, type World } from './sim/world'

/**
 * STEP 1 — enemies and spawning.
 *
 * Enemies now stream in from every side on a ring that travels with the
 * character, get harder over time via the difficulty formulas, and shove each
 * other apart so a crowd reads as a crowd.
 *
 * The character still wanders aimlessly — that placeholder is the *last* thing
 * to go, in step 2, when the danger map takes over and this file stops
 * deciding where he goes at all.
 */

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.')

const renderer = new Renderer(canvas)
const world = createWorld()

// --- placeholder wander (deleted in step 2) ----------------------------------

function pickNewWanderTarget(world: World): void {
  const p = pointInCircle(world.rng, config.character.wanderRange)
  world.character.targetX = world.character.x + p.x
  world.character.targetY = world.character.y + p.y
}
pickNewWanderTarget(world)

function updateWander(world: World, dt: number): void {
  const c = world.character
  const dx = c.targetX - c.x
  const dy = c.targetY - c.y
  const distance = Math.hypot(dx, dy)

  if (distance < 8) {
    pickNewWanderTarget(world)
    return
  }

  const step = c.speed * dt
  c.x += (dx / distance) * step
  c.y += (dy / distance) * step
}

// --- simulation --------------------------------------------------------------

function update(dt: number): void {
  world.time += dt

  // The spawner needs to know how much of the world is visible so it can place
  // enemies just outside it. Passed as plain numbers — nothing under sim/ ever
  // imports the renderer.
  updateSpawner(world, dt, renderer.width / 2, renderer.height / 2)
  updateEnemies(world, dt)
  updateWander(world, dt)

  const k = 1 - Math.exp(-config.render.cameraFollowRate * dt)
  renderer.camera.x += (world.character.x - renderer.camera.x) * k
  renderer.camera.y += (world.character.y - renderer.camera.y) * k
}

// --- rendering ---------------------------------------------------------------

let showOverlay = config.debug.showOverlay
window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    showOverlay = !showOverlay
  }
})

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const frame: Drawable[] = []

function render(): void {
  renderer.beginFrame()

  // Reused rather than reallocated: this runs 60+ times a second and would
  // otherwise churn out a few hundred throwaway objects per frame.
  frame.length = 0

  for (const enemy of world.enemies) {
    frame.push({
      x: enemy.x,
      y: enemy.y,
      w: enemy.def.radius * 2,
      h: enemy.def.drawHeight,
      colour: enemy.def.colour,
    })
  }

  frame.push({
    x: world.character.x,
    y: world.character.y,
    w: config.character.radius * 2,
    h: config.character.radius * 3.4,
    colour: '#e8c468',
  })

  renderer.drawScene(frame)

  if (showOverlay) {
    renderer.drawOverlay([
      `time         ${formatTime(world.time)}`,
      `enemies      ${world.enemies.length}`,
      `spawn rate   ${spawnsPerSecond(world.time).toFixed(1)}/s`,
      `enemy hp     x${hpMultiplier(world.time).toFixed(2)}`,
      `fps          ${stats.fps.toFixed(0)}`,
      `F1           toggle this panel`,
    ])
  }
}

startLoop(update, render)
