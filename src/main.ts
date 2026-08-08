import { config } from './config'
import { startLoop, stats } from './core/loop'
import { drawCandidates, drawHeatmap } from './render/debugOverlay'
import { Renderer, type Drawable } from './render/renderer'
import { updateContactDamage } from './sim/damage'
import { hpMultiplier, spawnsPerSecond } from './sim/difficulty'
import { updateEnemies } from './sim/enemyMovement'
import { resetInfluenceClock, updateInfluence } from './sim/influence'
import { updateCharacterMovement } from './sim/movement'
import { updatePickups } from './sim/pickups'
import { updateSpawner } from './sim/spawner'
import { createWorld } from './sim/world'

/**
 * STEP 2 — the danger map, the movement AI, damage and death.
 *
 * The character now decides where to go entirely on his own, from one rule:
 * read the influence field around him and walk uphill. Enemies push the field
 * down, pickups pull it up, and everything you see him do — threading gaps,
 * backing off, committing to a run — comes out of that one comparison. There
 * is no code anywhere that says "flee" or "collect".
 *
 * He can die now. Runs use a fixed seed, so the same run repeats exactly:
 * change a weight, watch the survival time move, and you have a real
 * measurement instead of an impression.
 */

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.')

const renderer = new Renderer(canvas)

let world = createWorld()
let bestTime = 0
let lastTime = 0
let deathElapsed = 0

function restart(): void {
  world = createWorld()
  resetInfluenceClock()
  deathElapsed = 0
}

/**
 * Called on the frame contact damage finishes him off. Separate function
 * rather than inline, because the early return at the top of update() has
 * already convinced the type checker he's still alive by that point.
 */
function recordDeathIfNeeded(): void {
  if (world.state !== 'dead') return
  lastTime = world.time
  if (world.time > bestTime) bestTime = world.time
}

// --- simulation --------------------------------------------------------------

function update(dt: number): void {
  if (world.state === 'dead') {
    deathElapsed += dt
    if (config.debug.autoRestartSeconds > 0 && deathElapsed >= config.debug.autoRestartSeconds) {
      restart()
    }
    return
  }

  world.time += dt

  // The spawner needs to know how much of the world is visible so it can place
  // enemies just outside it. Passed as plain numbers — nothing under sim/ ever
  // imports the renderer.
  updateSpawner(world, dt, renderer.width / 2, renderer.height / 2)
  updateEnemies(world, dt)
  updatePickups(world, dt)

  // Order matters: the field is built from where things are *now*, then the
  // character reads it, then we find out whether that was a good idea.
  updateInfluence(world, dt)
  updateCharacterMovement(world, dt)
  updateContactDamage(world, dt)

  recordDeathIfNeeded()

  const k = 1 - Math.exp(-config.render.cameraFollowRate * dt)
  renderer.camera.x += (world.character.x - renderer.camera.x) * k
  renderer.camera.y += (world.character.y - renderer.camera.y) * k
}

// --- input (debug only) ------------------------------------------------------

let showOverlay = config.debug.showOverlay
let showHeatmap = config.debug.showHeatmap
let showCandidates = config.debug.showCandidates

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'F1':
      e.preventDefault()
      showOverlay = !showOverlay
      break
    case 'F2':
      e.preventDefault()
      showHeatmap = !showHeatmap
      break
    case 'F3':
      e.preventDefault()
      showCandidates = !showCandidates
      break
    case 'r':
    case 'R':
      restart()
      break
  }
})

canvas.addEventListener('pointerdown', () => {
  if (world.state === 'dead') restart()
})

// --- rendering ---------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const frame: Drawable[] = []

function render(): void {
  renderer.beginFrame()

  // Under the sprites, so it reads as ground rather than fog.
  if (showHeatmap) drawHeatmap(renderer)

  // Reused rather than reallocated: this runs 60+ times a second and would
  // otherwise churn out a few hundred throwaway objects per frame.
  frame.length = 0

  for (const pickup of world.pickups) {
    frame.push({ x: pickup.x, y: pickup.y, w: 9, h: 9, colour: '#4fd6e8' })
  }

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
    colour: world.state === 'dead' ? '#6b5a34' : '#e8c468',
  })

  renderer.drawScene(frame)

  if (showCandidates) drawCandidates(renderer, world)

  renderer.drawHealthBar(world.character.hp / world.character.maxHp)

  if (showOverlay) {
    renderer.drawOverlay([
      `time         ${formatTime(world.time)}`,
      `hp           ${world.character.hp.toFixed(0)} / ${world.character.maxHp}`,
      `taking       ${world.incomingDps.toFixed(0)} dps`,
      `enemies      ${world.enemies.length}`,
      `pickups      ${world.pickups.length} on ground`,
      `collected    ${world.pickupsCollected}`,
      `spawn rate   ${spawnsPerSecond(world.time).toFixed(1)}/s`,
      `enemy hp     x${hpMultiplier(world.time).toFixed(2)}`,
      `wraps        ${world.wraps}`,
      `last / best  ${formatTime(lastTime)} / ${formatTime(bestTime)}`,
      `fps          ${stats.fps.toFixed(0)}`,
      `F1 F2 F3     panel / heatmap / fan`,
    ])
  }

  if (world.state === 'dead') {
    renderer.drawBanner(`Died at ${formatTime(world.time)}`, [
      `collected ${world.pickupsCollected} pickups`,
      `best so far ${formatTime(bestTime)}`,
      'click or press R to restart',
    ])
  }
}

startLoop(update, render)
