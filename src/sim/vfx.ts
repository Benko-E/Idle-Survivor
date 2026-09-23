import type { World } from './world'

/**
 * Short-lived visual flourishes — the expanding ring of a nova, the arc of a
 * chain jump.
 *
 * Purely cosmetic and deliberately dumb: they carry no gameplay meaning and
 * nothing ever reads them back. A nova has already dealt its damage by the
 * time the ring is drawn. Keeping them inert means they can be thrown away or
 * replaced wholesale when real art arrives.
 */

export interface Vfx {
  kind: 'ring' | 'line' | 'sprite'
  x: number
  y: number
  /** Line endpoints. Unused by rings. */
  x2: number
  y2: number
  radius: number
  colour: string
  life: number
  maxLife: number
  /**
   * Effect art by name (art-source/fx/), for 'sprite' and optionally
   * 'line'. A name the renderer can't find falls back to the plain shape.
   */
  art?: string
  /** For 'sprite': drawn width in world units. Height follows the art. */
  width?: number
  /** For 'sprite': stands on the ground rather than floating at its point. */
  grounded?: boolean
}

export function spawnRing(world: World, x: number, y: number, radius: number, colour: string, life: number): void {
  world.vfx.push({ kind: 'ring', x, y, x2: 0, y2: 0, radius, colour, life, maxLife: life })
}

export function spawnLine(
  world: World,
  x: number,
  y: number,
  x2: number,
  y2: number,
  colour: string,
  life: number,
): void {
  world.vfx.push({ kind: 'line', x, y, x2, y2, radius: 0, colour, life, maxLife: life })
}

/** How big, in world units, and how brief, in seconds, a hit flash is. */
export const HIT_SPARK_SIZE = 24
export const HIT_SPARK_SECONDS = 0.22

/** An animation played once at a point: an explosion, a lightning strike, a hit spark. */
export function spawnSprite(world: World, art: string, x: number, y: number, width: number, life: number, grounded: boolean): void {
  world.vfx.push({ kind: 'sprite', x, y, x2: 0, y2: 0, radius: 0, colour: '#ffffff', life, maxLife: life, art, width, grounded })
}

/** A line that may be drawn with art, stretched between its ends. */
export function spawnArtLine(world: World, x: number, y: number, x2: number, y2: number, colour: string, life: number, art?: string): void {
  world.vfx.push({ kind: 'line', x, y, x2, y2, radius: 0, colour, life, maxLife: life, art })
}

export function updateVfx(world: World, dt: number): void {
  for (let i = world.vfx.length - 1; i >= 0; i--) {
    world.vfx[i].life -= dt
    if (world.vfx[i].life > 0) continue
    world.vfx[i] = world.vfx[world.vfx.length - 1]
    world.vfx.pop()
  }
}
