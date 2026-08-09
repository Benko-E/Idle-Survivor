import { config } from './config'
import { startLoop, stats } from './core/loop'
import { drawCandidates, drawFootprint, drawHeatmap, drawTrail } from './render/debugOverlay'
import { drawEffects } from './render/effects'
import { Renderer, type Drawable } from './render/renderer'
import { updateCombat } from './sim/combat'
import { updateContactDamage } from './sim/damage'
import { hpMultiplier, spawnsPerSecond } from './sim/difficulty'
import { updateEnemies } from './sim/enemyMovement'
import { resetInfluenceClock, updateInfluence } from './sim/influence'
import { updateCharacterMovement } from './sim/movement'
import { occupancySaturation, updateOccupancy } from './sim/occupancy'
import { pickupColour, pickupSize } from './sim/pickupTiers'
import { updatePickups } from './sim/pickups'
import { levelProgress } from './sim/progression'
import { distanceToShop, shopEagerness, updateShop } from './sim/shop'
import { updateSpawner } from './sim/spawner'
import { updateTrail } from './sim/trail'
import { createWorld } from './sim/world'
import { DraftUi } from './ui/draft'

/**
 * STEP 3 — spells and combat.
 *
 * He now casts on his own from a spellbook defined entirely in data. Four
 * behaviours cover four shapes of spell: a thrown bolt, a burst around
 * himself, a chain that leaps between targets, and a curse that damages over
 * time. Nothing in the engine names any of them.
 *
 * Every number a spell uses is resolved through the modifier system, even
 * though nothing modifies anything yet. That's the point — step 6 hands out
 * "+15% to fire spells" and it works everywhere with no further changes.
 */

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.')

const renderer = new Renderer(canvas)

let world = createWorld()
// A getter, because restarting replaces the world object entirely.
const draftUi = new DraftUi(() => world)
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

  // Enemies move first and rebuild the neighbour grid, which spell targeting
  // then shares for the rest of the frame.
  updateEnemies(world, dt)
  updatePickups(world, dt)

  // Then the field is built from where everything is now, the character reads
  // it, and finally we find out whether that was a good idea.
  updateInfluence(world, dt)
  updateCharacterMovement(world, dt)
  // After moving, so both land on where he now is.
  updateTrail(world)
  updateOccupancy(world, dt)
  updateShop(world)
  updateCombat(world, dt)
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

// Dev aids. `world()` returns live game state — a getter rather than a
// reference, because restarting replaces the whole object. `config` is the
// live tuning object, so console edits take effect on the next frame.
const devGlobals = window as unknown as Record<string, unknown>
devGlobals.world = () => world
devGlobals.config = config

// --- rendering ---------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** "12/3/1" — how many globes of each tier are lying around. */
function tierHistogram(): string {
  const counts: number[] = []
  for (const pickup of world.pickups) {
    counts[pickup.tier] = (counts[pickup.tier] ?? 0) + 1
  }
  if (counts.length === 0) return '-'
  return Array.from(counts, (n) => n ?? 0).join('/')
}

const frame: Drawable[] = []

function render(): void {
  draftUi.update()
  renderer.beginFrame()

  // Under the sprites, so it reads as ground rather than fog.
  if (showHeatmap) drawHeatmap(renderer, world)

  // Reused rather than reallocated: this runs 60+ times a second and would
  // otherwise churn out a few hundred throwaway objects per frame.
  frame.length = 0

  if (config.shop.enabled) {
    const size = config.shop.drawSize
    frame.push({
      x: world.shopX,
      y: world.shopY,
      w: size,
      h: size,
      // Brightens once he's actually interested in going.
      colour: shopEagerness(world) > 0 ? '#ffd76b' : '#5c6b78',
    })
  }

  for (const pickup of world.pickups) {
    const size = pickupSize(pickup)
    frame.push({ x: pickup.x, y: pickup.y, w: size, h: size, colour: pickupColour(pickup) })
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

  for (const projectile of world.projectiles) {
    frame.push({
      x: projectile.x,
      y: projectile.y,
      w: projectile.radius * 2,
      h: projectile.radius * 2,
      colour: projectile.colour,
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

  drawEffects(renderer, world)

  if (showCandidates) {
    drawTrail(renderer, world)
    drawFootprint(renderer, world)
    drawCandidates(renderer, world)
  }

  if (config.shop.enabled) {
    renderer.drawOffscreenMarker(world.shopX, world.shopY, shopEagerness(world) > 0 ? '#ffd76b' : '#3f4a54')
  }

  renderer.drawXpBar(levelProgress(world), world.level)
  renderer.drawHealthBar(world.character.hp / world.character.maxHp)

  if (showOverlay) {
    const elapsed = Math.max(world.time, 0.001)
    renderer.drawOverlay([
      `time         ${formatTime(world.time)}`,
      `hp           ${world.character.hp.toFixed(0)} / ${world.character.maxHp}`,
      `taking       ${world.incomingDps.toFixed(0)} dps`,
      `enemies      ${world.enemies.length}`,
      `kills        ${world.kills}`,
      `dealing      ${(world.damageDealt / elapsed).toFixed(0)} dps`,
      `level        ${world.level}  (${world.pendingLevelUps} unspent)`,
      `gold         ${world.gold.toFixed(0)} carried, ${world.goldEarned.toFixed(0)} earned`,
      `pickups      ${world.pickups.length} down, ${world.pickupsCollected} taken`,
      `by tier      ${tierHistogram()}`,
      `missed       ${world.pickupsMissed}`,
      `spawn rate   ${spawnsPerSecond(world.time).toFixed(1)}/s`,
      `enemy hp     x${hpMultiplier(world.time).toFixed(2)}`,
      `camped here  ${(occupancySaturation(world, world.character.x, world.character.y) * 100).toFixed(0)}%`,
      `to bank at   ${config.shop.spendThreshold} gold`,
      `shop         ${distanceToShop(world).toFixed(0)} away, ${world.shopVisits} visits`,
      `doing        ${world.intent}`,
      `wraps        ${world.wraps}`,
      `last / best  ${formatTime(lastTime)} / ${formatTime(bestTime)}`,
      `fps          ${stats.fps.toFixed(0)}`,
      // On screen so "did it zoom?" is answerable by comparing two
      // screenshots instead of measuring sprites. There is no scale factor
      // anywhere in the renderer, so if things look smaller, one of these
      // numbers changed — browser zoom moves innerWidth, not the game.
      `viewport     ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
      // Which spells are actually pulling their weight, and whether one is
      // silently never finding a target.
      ...world.weapons.map((weapon) => `  ${weapon.def.displayName.padEnd(11)}${weapon.timesCast}`),
      `F1 F2 F3     panel / heatmap / fan`,
    ])
  }

  if (world.state === 'dead') {
    renderer.drawBanner(`Died at ${formatTime(world.time)}`, [
      `${world.kills} kills, ${world.xp.toFixed(0)} xp`,
      `best so far ${formatTime(bestTime)}`,
      'click or press R to restart',
    ])
  }
}

startLoop(update, render)
