import coinsUrl from '../../art-source/coins.png'
import groundUrl from '../../art-source/ground.png'
import heroUrl from '../../art-source/hero.png'
import hulkUrl from '../../art-source/hulk.png'
import shamblerUrl from '../../art-source/shambler.png'
import stalkerUrl from '../../art-source/stalker.png'
import heroCastUrl from '../../art-source/hero_cast.png'
import flamesUrl from '../../art-source/flames.png'
import chestUrl from '../../art-source/chest.png'
import shopkeeperUrl from '../../art-source/shopkeeper.png'
import orbIceUrl from '../../art-source/orb_ice.png'
import orbFireUrl from '../../art-source/orb_fire.png'

/**
 * World props — trees, stumps, the shop camp — one image each, picked up by
 * file name. A new prop is a line in tools/extract-art.ps1 and an entry in
 * data/obstacles.ts; nothing here changes. Loaded as `prop:<name>`.
 */
const PROP_FILES = import.meta.glob('../../art-source/props/*.png', { eager: true, import: 'default' }) as Record<string, string>

/**
 * Spell effects from art-source/fx/ (made by tools/GeneratedArt.cs from the
 * generated art), loaded as `fx:<name>`. Each is a strip of frames; the count
 * has to be known here because the file doesn't carry it. A missing file just
 * means that effect is drawn with plain shapes.
 */
/** Interface pieces drawn on the canvas — the health and XP bars. `ui:<name>`. */
const UI_FILES = import.meta.glob('../../art-source/ui/bar_*.png', { eager: true, import: 'default' }) as Record<string, string>

const FX_FILES = import.meta.glob('../../art-source/fx/*.png', { eager: true, import: 'default' }) as Record<string, string>
const FX_FRAMES: Record<string, number> = {
  strike: 4,
  storm_cloud: 3,
  arc: 3,
  ball_lightning: 4,
  meteor: 4,
  explosion: 6,
  scorch: 4,
  ice_shard: 5,
  frost_ground: 1,
  holy_flames: 4,
  hit_fire: 3,
  hit_frost: 3,
  hit_lightning: 3,
}

/**
 * Sprite loading.
 *
 * The images live in art-source/, which is gitignored — the licence lets us
 * embed the art in the game but not ship the assets in a public repo. Vite
 * inlines them as base64 at build time, so the published page is one file with
 * no asset requests, and there is no PNG anyone can navigate to.
 *
 * A consequence worth knowing: a fresh clone of this repo cannot build until
 * `tools/extract-art.ps1` has been run against the purchased packs.
 *
 * Sheets are RPG Maker layout — three walk frames across, four facings down,
 * in the order down, left, right, up.
 */

export interface SpriteSheet {
  image: HTMLImageElement
  frameWidth: number
  frameHeight: number
  /** Width over height, so callers can size by height and keep proportions. */
  aspect: number
  /** Frames across: walk frames for a character sheet, the whole strip otherwise. */
  frames: number
}

const COLUMNS = 3
const ROWS = 4

/**
 * Coin art tiers. Gold tiers are unbounded (the merge ladder has no ceiling)
 * so anything above the last one reuses the biggest pile.
 */
export const COIN_TIERS = 3

export function coinFrame(tier: number): number {
  return Math.min(tier, COIN_TIERS - 1)
}

/** Row indices, matching the sheet layout. */
export const FACE_DOWN = 0
export const FACE_LEFT = 1
export const FACE_RIGHT = 2
export const FACE_UP = 3

/**
 * Walk cycle order. The middle frame is the standing pose, so a three-frame
 * sheet reads as a four-step cycle: step, stand, step, stand.
 */
const WALK_CYCLE = [0, 1, 2, 1]

const sheets = new Map<string, SpriteSheet>()
let ground: HTMLImageElement | null = null
let ready = false

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load sprite: ${url}`))
    image.src = url
  })
}

async function loadSheet(name: string, url: string): Promise<void> {
  const image = await loadImage(url)
  const frameWidth = image.width / COLUMNS
  const frameHeight = image.height / ROWS
  sheets.set(name, { image, frameWidth, frameHeight, aspect: frameWidth / frameHeight, frames: COLUMNS })
}

/** A single row of frames, for things that don't walk. */
async function loadStrip(name: string, url: string, frames: number): Promise<void> {
  const image = await loadImage(url)
  const frameWidth = image.width / frames
  sheets.set(name, {
    image,
    frameWidth,
    frameHeight: image.height,
    aspect: frameWidth / image.height,
    frames,
  })
}

/** Resolves once everything is decoded and the first frame can be drawn. */
export async function loadSprites(): Promise<void> {
  await Promise.all([
    loadSheet('hero', heroUrl),
    loadSheet('shambler', shamblerUrl),
    loadSheet('hulk', hulkUrl),
    loadSheet('stalker', stalkerUrl),
    loadStrip('coins', coinsUrl, COIN_TIERS),
    loadStrip('hero_cast', heroCastUrl, 3),
    loadStrip('flames', flamesUrl, 4),
    loadStrip('chest', chestUrl, 4),
    loadStrip('shopkeeper', shopkeeperUrl, 1),
    loadStrip('orb_ice', orbIceUrl, 4),
    loadStrip('orb_fire', orbFireUrl, 4),
    ...Object.entries(UI_FILES).map(([path, url]) => loadStrip(`ui:${path.split('/').pop()!.replace(/\.png$/, '')}`, url, 1)),
    ...Object.entries(FX_FILES).map(([path, url]) => {
      const name = path.split('/').pop()!.replace(/\.png$/, '')
      return loadStrip(`fx:${name}`, url, FX_FRAMES[name] ?? 1)
    }),
    ...Object.entries(PROP_FILES).map(([path, url]) => loadStrip(`prop:${path.split('/').pop()!.replace(/\.png$/, '')}`, url, 1)),
    loadImage(groundUrl).then((image) => {
      ground = image
    }),
  ])
  ready = true
}

export function spritesReady(): boolean {
  return ready
}

export function getSheet(name: string | undefined): SpriteSheet | undefined {
  return name ? sheets.get(name) : undefined
}

/** The ground strip: N square tiles side by side, plain ones first. */
export function getGroundStrip(): HTMLImageElement | null {
  return ground
}

/**
 * Which row to draw, from a heading.
 *
 * The dominant axis wins, so a diagonal picks whichever of the four facings it
 * leans towards. Four-direction sheets are the norm for this art and reading
 * eight directions out of four would just look wrong.
 */
export function facingRow(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? FACE_RIGHT : FACE_LEFT
  return dy > 0 ? FACE_DOWN : FACE_UP
}

/** Unit vector each row faces, indexed by row. */
const ROW_DIRECTIONS: [number, number][] = []
ROW_DIRECTIONS[FACE_DOWN] = [0, 1]
ROW_DIRECTIONS[FACE_LEFT] = [-1, 0]
ROW_DIRECTIONS[FACE_RIGHT] = [1, 0]
ROW_DIRECTIONS[FACE_UP] = [0, -1]

/** Remembered row per thing drawn. Weak, so dead enemies don't linger in it. */
const lastRow = new WeakMap<object, number>()

/**
 * facingRow, but reluctant to change its mind.
 *
 * With four facings, anything walking near a diagonal sits on the boundary
 * between two of them, and the smallest wobble flips the sprite from one to
 * the other and back — measured at about once a second for him, and it reads
 * as stutter-stepping even when the path itself is smooth. Here the current
 * row is kept until the heading is `slackDegrees` past the diagonal.
 *
 * `owner` is whatever is being drawn; its last row is remembered against it.
 */
export function stickyFacingRow(owner: object, dx: number, dy: number, slackDegrees: number): number {
  const fresh = facingRow(dx, dy)
  const previous = lastRow.get(owner)
  if (previous === undefined || previous === fresh) {
    lastRow.set(owner, fresh)
    return fresh
  }

  const length = Math.hypot(dx, dy)
  if (length === 0) return previous
  const [rx, ry] = ROW_DIRECTIONS[previous]
  const cosine = (dx * rx + dy * ry) / length
  // Still within 45° plus the slack of the old facing: keep it.
  if (cosine >= Math.cos(((45 + slackDegrees) * Math.PI) / 180)) return previous

  lastRow.set(owner, fresh)
  return fresh
}

/**
 * Which walk frame to draw.
 *
 * From distance actually walked, one frame per `stepLength`. It used to be
 * elapsed time multiplied by nominal speed, which looked right until anything
 * changed the real speed: a chilled enemy kept marching at full pace, a speed
 * upgrade left his feet shuffling at the old rate, and the moment a slow
 * landed the phase jumped and the sprite skipped frames.
 *
 * The per-entity offset stops a crowd of identical enemies stepping in unison.
 */
export function walkFrame(stride: number, offset: number, stepLength: number): number {
  const phase = stride / stepLength + offset * 0.37
  return WALK_CYCLE[Math.floor(phase) % WALK_CYCLE.length]
}
