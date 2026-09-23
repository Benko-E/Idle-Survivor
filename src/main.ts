import { config } from './config'
import { startLoop, stats } from './core/loop'
import { drawCandidates, drawFootprint, drawHeatmap, drawTrail } from './render/debugOverlay'
import { loadProfile, saveProfile } from './meta/profile'
import { DamageNumbers } from './render/damageNumbers'
import { EnemyLooks } from './render/enemyLooks'
import { drawEffects, drawGroundEffects } from './render/effects'
import { pushWorldProps } from './render/props'
import { Renderer, type Drawable } from './render/renderer'
import { coinFrame, getSheet, loadSprites, stickyFacingRow, walkFrame } from './render/sprites'
import { updateCombat } from './sim/combat'
import { updateContactDamage } from './sim/damage'
import { hpMultiplier, spawnsPerSecond } from './sim/difficulty'
import { updateEnemies } from './sim/enemyMovement'
import { gameEvents } from './sim/events'
import { resetInfluenceClock, updateInfluence } from './sim/influence'
import { updateCharacterMovement } from './sim/movement'
import { pickupColour, pickupSize } from './sim/pickupTiers'
import { updatePickups } from './sim/pickups'
import { levelProgress } from './sim/progression'
import { distanceToShop, shopEagerness, updateShop } from './sim/shop'
import { updateSpawner } from './sim/spawner'
import { updateTrail } from './sim/trail'
import { updateVitals } from './sim/vitals'
import { createWorld } from './sim/world'
import { DebugPanel } from './ui/debugPanel'
import { DraftUi } from './ui/draft'
import { MENU_ENTRIES } from './ui/menu/entries'
import { installSkin } from './ui/skin'
import { SpellBar } from './ui/spellBar'
import { ThoughtBubbles } from './ui/thoughts'
import { SpellChoiceUi } from './ui/spellChoice'
import { Menu } from './ui/menu/menu'

/**
 * The composition root: builds the world and the renderer, runs the fixed-step
 * loop, and turns world state into a draw list each frame. Also the switch
 * between the menu and a run, and the only place the save file is touched.
 *
 * The simulation lives entirely under sim/ and never imports anything from
 * render/ or ui/. This file is the only place the two meet — the spawner is
 * handed how much world is on screen as plain numbers, and the renderer is
 * handed flat descriptions of what to paint. See the README for how the
 * pieces fit together.
 */

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.')

const renderer = new Renderer(canvas)
installSkin()

// Behind the menu until Play is pressed: a fresh world, drawn but not updated.
let world = createWorld()
// A getter, because restarting replaces the world object entirely.
const draftUi = new DraftUi(() => world)
const spellChoiceUi = new SpellChoiceUi(() => world)
const spellBar = new SpellBar(() => world, () => spellChoiceUi.show())
const thoughts = new ThoughtBubbles()
new DebugPanel()
let bestTime = 0
let lastTime = 0
let deathElapsed = 0

/**
 * Menu or run. While the menu is up the simulation doesn't step at all — the
 * world behind it is a still picture, whether that's the last run's death or
 * a fresh one waiting to start.
 */
let mode: 'menu' | 'playing' = 'menu'

const profile = loadProfile()

// Banked gold is written the moment it's deposited, not at the end of the
// run, so closing the tab mid-run keeps everything already banked.
gameEvents.on('banked', ({ amount }) => {
  profile.bankedGold += amount
  saveProfile(profile)
})

const damageNumbers = new DamageNumbers()

// When he last banked, for the chest to pop open. Render-side memory only.
let bankedAt = -Infinity
gameEvents.on('banked', () => {
  bankedAt = world.time
})

/**
 * The casting pose: his own "reading from the spellbook" frames, played when a
 * big spell goes off. Only spells with a real recharge get it — a bolt every
 * second would keep him in the pose permanently, and the aura and orbit tick
 * many times a second.
 */
let castPoseAt = -Infinity
const castsSeen = new Map<string, number>()
function noticeCasts(): void {
  for (const weapon of world.weapons) {
    const seen = castsSeen.get(weapon.def.id) ?? 0
    if (weapon.timesCast > seen && (weapon.def.stats.cooldown ?? 0) >= config.render.castPoseMinCooldown) castPoseAt = world.time
    castsSeen.set(weapon.def.id, weapon.timesCast)
  }
}
gameEvents.on('enemyDamaged', (event) => damageNumbers.record(event))
const enemyLooks = new EnemyLooks()
gameEvents.on('enemyDamaged', (event) => enemyLooks.record(event, world))

gameEvents.on('died', ({ time }) => {
  lastTime = time
  if (time > bestTime) bestTime = time
})

const menu = new Menu(MENU_ENTRIES, {
  play: startRun,
  bankedGold: () => profile.bankedGold,
})

/** The spell picked at the start of the last run, reused by a quick restart. */
let lastStarterId: string | undefined

/** A fresh run: new world, camera on him, menu away. */
function startRun(starterId?: string): void {
  lastStarterId = starterId ?? lastStarterId
  // A new seed per run unless the debug panel pins one. Math.random is fine
  // here: it only picks the seed, and everything after is deterministic.
  const seed = config.world.randomSeed ? Math.floor(Math.random() * 2 ** 31) : config.world.seed
  world = createWorld(seed, lastStarterId)
  resetInfluenceClock()
  damageNumbers.clear()
  enemyLooks.clear()
  castsSeen.clear()
  castPoseAt = -Infinity
  bankedAt = -Infinity
  deathElapsed = 0
  renderer.camera.x = world.character.x
  renderer.camera.y = world.character.y
  mode = 'playing'
  menu.hide()
}

function openMenu(): void {
  mode = 'menu'
  menu.show()
}

// --- simulation --------------------------------------------------------------

function update(dt: number): void {
  if (mode === 'menu') return

  if (world.state === 'dead') {
    deathElapsed += dt
    const autoRestart = config.debug.autoRestartSeconds
    if (autoRestart > 0) {
      if (deathElapsed >= autoRestart) startRun()
    } else if (deathElapsed >= config.menu.afterDeathSeconds) {
      openMenu()
    }
    return
  }

  world.time += dt

  // The spawner needs to know how much of the world is visible so it can place
  // enemies just outside it. Passed as plain numbers — nothing under sim/ ever
  // imports the renderer.
  // World units, not pixels — so how far off screen enemies appear no longer
  // depends on the size of the window.
  updateSpawner(world, dt, renderer.worldHalfWidth, renderer.worldHalfHeight)

  // Enemies move first and rebuild the neighbour grid, which spell targeting
  // then shares for the rest of the frame.
  updateEnemies(world, dt)
  updatePickups(world, dt)

  // Then the field is built from where everything is now, the character reads
  // it, and finally we find out whether that was a good idea.
  updateInfluence(world, dt)
  updateCharacterMovement(world, dt)
  // After moving, so the mark lands where he now is.
  updateTrail(world)
  updateShop(world)
  updateCombat(world, dt)
  // Healing before damage, so a hit that would kill him this step is judged
  // against his health after this step's regeneration.
  updateVitals(world, dt)
  updateContactDamage(world, dt)
  damageNumbers.update(dt)
  noticeCasts()

  const k = 1 - Math.exp(-config.render.cameraFollowRate * dt)
  renderer.camera.x += (world.character.x - renderer.camera.x) * k
  renderer.camera.y += (world.character.y - renderer.camera.y) * k
}

// --- input (debug only) ------------------------------------------------------

let showOverlay = config.debug.showOverlay
let showHeatmap = config.debug.showHeatmap
let showCandidates = config.debug.showCandidates

/**
 * Whether a key press belongs to a form field rather than the game.
 *
 * Without this, typing into the debug panel's text fields fired the game's
 * hotkeys — every `r` in a spell id like `spell_curse_01` restarted the run.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return
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
      // A quick restart during a run. Not from the menu — that has Play.
      if (mode === 'playing') startRun()
      break
  }
})

// Clicking the death banner skips the wait for the menu.
canvas.addEventListener('pointerdown', () => {
  if (mode === 'playing' && world.state === 'dead') openMenu()
})

// Dev aids. `world()` returns live game state — a getter rather than a
// reference, because restarting replaces the whole object. `config` is the
// live tuning object, so console edits take effect on the next frame.
const devGlobals = window as unknown as Record<string, unknown>
devGlobals.world = () => world
devGlobals.config = config
// The live save. Edit it and call save() to write it, e.g. to test the menu
// with a big bank: `profile.bankedGold = 5000; save()`.
devGlobals.profile = profile
devGlobals.save = () => saveProfile(profile)

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
  spellChoiceUi.update()
  spellBar.update(mode === 'playing')
  thoughts.update(world, renderer, mode === 'playing')
  renderer.beginFrame()

  // Under the sprites, so it reads as ground rather than fog.
  if (showHeatmap) drawHeatmap(renderer, world)

  // Reused rather than reallocated: this runs 60+ times a second and would
  // otherwise churn out a few hundred throwaway objects per frame.
  frame.length = 0

  // Trees, stumps and the shop camp.
  pushWorldProps(frame, renderer, world, bankedAt)

  const coins = getSheet('coins')
  for (const pickup of world.pickups) {
    const size = pickupSize(pickup)
    frame.push({
      x: pickup.x,
      y: pickup.y,
      w: size,
      h: size,
      colour: pickupColour(pickup),
      sheet: coins,
      frameCol: coins ? coinFrame(pickup.tier) : undefined,
      frameRow: 0,
      // Gold lies on the ground; a shadow under it would be nonsense.
      shadowRadius: 0,
    })
  }

  // Enemies, living and dying, with their hit flashes and fade ins.
  enemyLooks.push(frame, world)

  // Projectiles are drawn with the spell effects, as glowing balls in flight.

  const heroSheet = getSheet(config.character.sprite)
  const heroHeight = config.character.drawHeight
  const castSheet = getSheet('hero_cast')
  const casting = castSheet && world.state === 'running' && world.time - castPoseAt < config.render.castPoseSeconds
  if (casting) {
    // Same pixel scale as his walk frames, so the larger pose frame is drawn
    // larger rather than squeezed to his usual height.
    const pixel = config.render.pixelScale
    frame.push({
      x: world.character.x,
      y: world.character.y,
      w: castSheet.frameWidth * pixel,
      h: castSheet.frameHeight * pixel,
      colour: '#e8c468',
      sheet: castSheet,
      shadowRadius: config.character.radius,
      frameRow: 0,
      frameCol: Math.min(2, Math.floor(((world.time - castPoseAt) / config.render.castPoseSeconds) * 3)),
    })
  } else frame.push({
    x: world.character.x,
    y: world.character.y,
    w: heroSheet ? heroHeight * heroSheet.aspect : config.character.radius * 2,
    h: heroSheet ? heroHeight : config.character.radius * 3.4,
    colour: world.state === 'dead' ? '#6b5a34' : '#e8c468',
    sheet: heroSheet,
    shadowRadius: config.character.radius,
    frameRow: heroSheet
      ? stickyFacingRow(world.character, world.character.facingX, world.character.facingY, config.render.facingSlackDegrees)
      : undefined,
    // Frozen on the standing frame once he's dead.
    frameCol:
      heroSheet && world.state === 'running'
        ? walkFrame(world.character.stride, 0, config.character.stepLength)
        : 1,
  })

  // Flat effects under everyone's feet, standing ones over them.
  drawGroundEffects(renderer, world)
  enemyLooks.drawGround(renderer, world)
  renderer.drawScene(frame)

  drawEffects(renderer, world)
  enemyLooks.drawDust(renderer, world)
  damageNumbers.draw(renderer)

  if (showCandidates) {
    drawTrail(renderer, world)
    drawFootprint(renderer, world)
    drawCandidates(renderer, world)
  }

  if (config.shop.enabled) {
    renderer.drawOffscreenMarker(world.shopX, world.shopY, shopEagerness(world) > 0 ? '#ffd76b' : '#3f4a54')
  }

  // The bars and banner belong to a run; over the menu they're just clutter.
  if (mode === 'playing') {
    renderer.drawXpBar(levelProgress(world), world.level)
    renderer.drawHealthBar(world.character.hp / world.character.maxHp)
  }

  if (showOverlay) {
    const elapsed = Math.max(world.time, 0.001)
    renderer.drawOverlay([
      `time         ${formatTime(world.time)}`,
      `seed         ${world.seed}`,
      `hp           ${world.character.hp.toFixed(0)} / ${world.character.maxHp.toFixed(0)}`,
      `taking       ${world.incomingDps.toFixed(0)} dps`,
      `enemies      ${world.enemies.length}`,
      `kills        ${world.kills}`,
      `dealing      ${(world.damageDealt / elapsed).toFixed(0)} dps`,
      `level        ${world.level}  (${world.pendingLevelUps} unspent)`,
      `gold         ${world.gold.toFixed(0)} carried, ${world.bankedThisRun.toFixed(0)} banked`,
      `bank total   ${profile.bankedGold.toFixed(0)}  (${world.goldEarned.toFixed(0)} earned this run)`,
      `pickups      ${world.pickups.length} down, ${world.pickupsCollected} taken`,
      `by tier      ${tierHistogram()}`,
      `missed       ${world.pickupsMissed}`,
      `spawn rate   ${spawnsPerSecond(world.time).toFixed(1)}/s`,
      `enemy hp     x${hpMultiplier(world.time).toFixed(2)}`,
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
      // silently never finding a target. Idle time only builds while a spell is
      // ready with nothing in reach, so a lot of it means its range is too short
      // for how he plays.
      // And what share of the damage each is doing — the question behind
      // every balance change, answered live.
      ...world.weapons.map(
        (weapon) =>
          `  ${weapon.def.displayName.padEnd(18)}${String(Math.round((weapon.damageDealt / Math.max(1, world.damageDealt)) * 100)).padStart(3)}% dmg, ${weapon.timesCast} cast, ${weapon.idleSeconds.toFixed(0)}s idle`,
      ),
      ...(stats.errors > 0 ? [`ERRORS       ${stats.errors} (see console)`] : []),
      `F1 F2 F3     panel / heatmap / fan`,
    ])
  }

  if (mode === 'playing' && world.state === 'dead') {
    renderer.drawBanner(`Died at ${formatTime(world.time)}`, [
      `${world.kills} kills, ${world.xp.toFixed(0)} xp`,
      `banked ${world.bankedThisRun.toFixed(0)} gold, lost ${world.gold.toFixed(0)}`,
      `best so far ${formatTime(bestTime)}`,
      'click to continue',
    ])
  }
}

/**
 * Wait for the art before the first frame.
 *
 * Without this you get a flash of an empty world while the images decode.
 * If loading fails the game still starts — every drawable keeps a colour
 * fallback, so a missing sheet costs you the art, not the game.
 */
renderer.drawLoading('loading...')

loadSprites()
  .catch((error: unknown) => {
    console.warn('Sprites failed to load, falling back to shapes.', error)
  })
  .finally(() => {
    startLoop(update, render)
    openMenu()
  })
