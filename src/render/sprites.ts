import grassUrl from '../../art-source/grass.png'
import heroUrl from '../../art-source/hero.png'
import hulkUrl from '../../art-source/hulk.png'
import shamblerUrl from '../../art-source/shambler.png'
import stalkerUrl from '../../art-source/stalker.png'

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
}

const COLUMNS = 3
const ROWS = 4

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
  sheets.set(name, { image, frameWidth, frameHeight, aspect: frameWidth / frameHeight })
}

/** Resolves once everything is decoded and the first frame can be drawn. */
export async function loadSprites(): Promise<void> {
  await Promise.all([
    loadSheet('hero', heroUrl),
    loadSheet('shambler', shamblerUrl),
    loadSheet('hulk', hulkUrl),
    loadSheet('stalker', stalkerUrl),
    loadImage(grassUrl).then((image) => {
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

export function getGroundTile(): HTMLImageElement | null {
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

/**
 * Which walk frame to draw.
 *
 * Derived from elapsed time, speed and a per-entity offset rather than stored
 * on the entity: it keeps a purely visual concern out of the simulation, and
 * the offset stops a crowd of identical enemies marching in lockstep.
 */
export function walkFrame(time: number, speed: number, offset: number, stepLength: number): number {
  const phase = (time * speed) / stepLength + offset * 0.37
  return WALK_CYCLE[Math.floor(phase) % WALK_CYCLE.length]
}
