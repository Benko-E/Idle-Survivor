import { config } from '../config'
import { getGroundStrip, getSheet, type SpriteSheet } from './sprites'

/**
 * Everything the renderer knows how to draw.
 *
 * Note what is absent: there is no "enemy" or "character" here. The renderer
 * has no idea what any of these things are, which is what lets the whole
 * drawing layer be swapped out later (spec 5.1, and the Canvas->WebGL escape
 * hatch) without touching a line of simulation code.
 *
 * `y` is the sprite's *feet*, not its centre. That's the sort key, and it's
 * also where the shadow goes.
 */
export interface Drawable {
  x: number
  y: number
  w: number
  h: number
  /** Fallback fill, and still the whole story for things with no art yet. */
  colour: string
  /** When present, a frame from this sheet is drawn instead of the rectangle. */
  sheet?: SpriteSheet
  frameCol?: number
  frameRow?: number
  /**
   * Ground-shadow radius in world units. Defaults to half the drawn width,
   * which is wrong for sprites — most frames are mostly transparent padding,
   * so sizing the shadow from the image gives a crab a shadow twice its own
   * body and a packed horde one continuous smear. Pass the collision radius:
   * the shadow is the footprint, and that's what the footprint is. Zero for
   * things lying flat on the ground.
   */
  shadowRadius?: number
  /** 0 to 1. Used to fade a tree he's standing behind. */
  alpha?: number
  /** 0 to 1: how far the sprite is washed to solid white — a hit. */
  flash?: number
  /** A coloured wash under the flash, 0 to 1 — burning, frozen. */
  tint?: string
  tintAmount?: number
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private viewW = 0
  private viewH = 0

  /** Camera centre, in world coordinates. */
  readonly camera = { x: 0, y: 0 }

  /** Screen pixels per world unit. Recomputed every frame. */
  private scale = 1
  /** Pre-rendered ground chunks, keyed by chunk coordinate. */
  private readonly groundChunks = new Map<string, HTMLCanvasElement>()
  /** Tile size and span the cached chunks were built at. */
  private groundSignature = ''

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2D canvas context.')
    this.ctx = ctx
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  get width(): number {
    return this.viewW
  }

  get height(): number {
    return this.viewH
  }

  /** How many world units are visible from the centre to each edge. */
  get worldHalfWidth(): number {
    return this.viewW / 2 / this.scale
  }

  get worldHalfHeight(): number {
    return this.viewH / 2 / (this.scale * config.render.yScale)
  }

  private resize(): void {
    // Cap the pixel ratio: a 4x retina display gains no visible quality here
    // and costs 4x the fill rate, which we would rather spend on enemies.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.viewW = window.innerWidth
    this.viewH = window.innerHeight
    this.canvas.width = Math.round(this.viewW * dpr)
    this.canvas.height = Math.round(this.viewH * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Pixel art scaled up with smoothing turns to mush. Set after every
    // resize because changing the canvas size resets context state.
    this.ctx.imageSmoothingEnabled = false

    /**
     * Pin the amount of world on screen instead of the size of a pixel.
     *
     * World units used to map 1:1 to CSS pixels, which meant the window size
     * silently decided how much of the world you could see. Observed live: the
     * viewport went 721 -> 1089 -> 721 CSS pixels tall while the game ran, and
     * the view appeared to zoom out and back in. Nothing in the game had
     * changed; there was simply 50% more world on screen.
     *
     * Now a taller window draws everything proportionally bigger and shows the
     * same slice of world. The window decides how big things look, never how
     * much you see — which also makes the game usable on a phone, where at 1:1
     * the character filled a tenth of the screen.
     *
     * Only the vertical is pinned. A wide monitor still sees further sideways,
     * because the alternative is letterboxing, and nobody wants that.
     */
    this.recomputeScale()
  }

  /**
   * Recomputed every frame rather than only on resize, so the framing can be
   * dragged live in the debug panel. It's two divisions.
   */
  private recomputeScale(): void {
    const { visibleWorldHeight, minScale, maxScale, yScale } = config.render
    const fitted = this.viewH / (visibleWorldHeight * yScale)
    this.scale = Math.max(minScale, Math.min(maxScale, fitted))
  }

  /** Screen pixels per world unit, for placing page elements over the world. */
  get unitScale(): number {
    return this.scale
  }

  worldToScreenX(worldX: number): number {
    return (worldX - this.camera.x) * this.scale + this.viewW / 2
  }

  worldToScreenY(worldY: number): number {
    return (worldY - this.camera.y) * config.render.yScale * this.scale + this.viewH / 2
  }

  /** Clear and draw the ground plane. */
  beginFrame(): void {
    // Every frame, so `visibleWorldHeight` can be dragged live. The method
    // existed and claimed to run per frame for a while, but was only ever
    // called on resize — the slider silently did nothing.
    this.recomputeScale()

    const { ctx } = this
    ctx.fillStyle = config.render.backgroundColour
    ctx.fillRect(0, 0, this.viewW, this.viewH)
    this.drawGround()
  }

  /**
   * The ground grid scrolls with the camera and is generated from whatever
   * part of the world is currently on screen, so it works with an endless
   * world (spec A) without anything being pre-built.
   */
  private drawGround(): void {
    const { ctx } = this
    const cell = config.render.gridCellSize
    const halfW = this.worldHalfWidth
    const halfH = this.worldHalfHeight

    if (this.drawGroundChunks(halfW, halfH)) {
      const shade = config.render.groundShade
      if (shade > 0) {
        ctx.globalAlpha = shade
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, this.viewW, this.viewH)
        ctx.globalAlpha = 1
      }
    }

    if (!config.render.showGrid) return

    ctx.strokeStyle = config.render.gridColour
    ctx.lineWidth = 1
    ctx.beginPath()

    const firstX = Math.floor((this.camera.x - halfW) / cell) * cell
    for (let wx = firstX; wx <= this.camera.x + halfW; wx += cell) {
      // The 0.5 offset lands the line on a pixel centre so it stays crisp.
      const sx = Math.round(this.worldToScreenX(wx)) + 0.5
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, this.viewH)
    }

    const firstY = Math.floor((this.camera.y - halfH) / cell) * cell
    for (let wy = firstY; wy <= this.camera.y + halfH; wy += cell) {
      const sy = Math.round(this.worldToScreenY(wy)) + 0.5
      ctx.moveTo(0, sy)
      ctx.lineTo(this.viewW, sy)
    }

    ctx.stroke()
  }

  /**
   * Which tile a given square of ground uses.
   *
   * A hash of the position rather than a random draw, so the world looks the
   * same every time you return to a spot — an endless world can't remember
   * what it rolled, and grass that reshuffles as you walk back over it would
   * be far more distracting than grass that repeats.
   */
  private tileIndexAt(tileX: number, tileY: number, tileCount: number): number {
    let h = Math.imul(tileX, 374761393) + Math.imul(tileY, 668265263)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const unit = ((h ^ (h >>> 16)) >>> 0) / 4294967296

    const { groundDetailChance } = config.render
    // Whole, and never more than the strip holds: a fractional or oversized
    // count indexes past the end of the strip and draws nothing.
    const groundPlainTiles = Math.min(tileCount, Math.max(1, Math.round(config.render.groundPlainTiles)))
    const detailCount = tileCount - groundPlainTiles

    if (detailCount > 0 && unit < groundDetailChance) {
      return groundPlainTiles + Math.floor((unit / groundDetailChance) * detailCount) % detailCount
    }

    const plainUnit = detailCount > 0 ? (unit - groundDetailChance) / (1 - groundDetailChance) : unit
    return Math.floor(plainUnit * groundPlainTiles) % groundPlainTiles
  }

  /**
   * Tile size and chunk span, as whole numbers. Both size canvases and index
   * into the tile strip, so a fractional value from the debug panel would
   * otherwise produce blurry, misaligned or empty chunks.
   */
  private groundGeometry(): { tile: number; span: number } {
    return {
      tile: Math.max(1, Math.round(config.render.groundTileSize)),
      span: Math.max(1, Math.round(config.render.groundChunkTiles)),
    }
  }

  /** Renders one chunk of ground to an offscreen canvas, once. */
  private buildGroundChunk(chunkX: number, chunkY: number, strip: HTMLImageElement): HTMLCanvasElement {
    const { tile, span } = this.groundGeometry()
    const tileCount = Math.max(1, Math.round(strip.width / strip.height))

    const canvas = document.createElement('canvas')
    canvas.width = tile * span
    canvas.height = tile * span

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      for (let ty = 0; ty < span; ty++) {
        for (let tx = 0; tx < span; tx++) {
          const worldTileX = chunkX * span + tx
          const worldTileY = chunkY * span + ty
          const index = this.tileIndexAt(worldTileX, worldTileY, tileCount)
          ctx.drawImage(strip, index * tile, 0, tile, tile, tx * tile, ty * tile, tile, tile)
        }
      }
    }

    return canvas
  }

  /**
   * Blit whichever pre-rendered chunks are on screen.
   *
   * Drawing every tile individually would be a few thousand draw calls a
   * frame; chunking makes it about twenty. Returns false if the art hasn't
   * loaded, so the caller can skip the shading pass too.
   */
  private drawGroundChunks(halfW: number, halfH: number): boolean {
    const strip = getGroundStrip()
    if (!strip) return false

    const { tile, span } = this.groundGeometry()
    const chunkWorld = tile * span

    // Chunks are baked at one tile size and span. If either is retuned live,
    // everything cached is the wrong shape, so start over.
    const signature = `${tile}|${span}`
    if (signature !== this.groundSignature) {
      this.groundChunks.clear()
      this.groundSignature = signature
    }

    const minChunkX = Math.floor((this.camera.x - halfW) / chunkWorld)
    const maxChunkX = Math.floor((this.camera.x + halfW) / chunkWorld)
    const minChunkY = Math.floor((this.camera.y - halfH) / chunkWorld)
    const maxChunkY = Math.floor((this.camera.y + halfH) / chunkWorld)

    /**
     * Twice what's on screen, plus slack for walking. Each chunk is a 256px
     * canvas, about a quarter of a megabyte, and the old fixed cap of 200 was
     * eight times the visible set — roughly 50 MB held for no benefit, which
     * matters on a phone. Derived from the view rather than fixed, so a wide
     * enough window can never need more chunks than the cache will keep and
     * start rebuilding the ones it's looking at.
     */
    const visible = (maxChunkX - minChunkX + 1) * (maxChunkY - minChunkY + 1)
    const capacity = visible * 2 + 16

    const { ctx } = this

    for (let cy = minChunkY; cy <= maxChunkY; cy++) {
      for (let cx = minChunkX; cx <= maxChunkX; cx++) {
        const key = `${cx},${cy}`
        let chunk = this.groundChunks.get(key)
        if (!chunk) {
          chunk = this.buildGroundChunk(cx, cy, strip)
          this.groundChunks.set(key, chunk)
          // Map preserves insertion order, so the oldest goes first. That's
          // the chunk furthest behind him when he's walking, and when he's
          // standing still nothing new is built, so nothing is evicted.
          while (this.groundChunks.size > capacity) {
            const oldest = this.groundChunks.keys().next().value
            if (oldest === undefined) break
            this.groundChunks.delete(oldest)
          }
        }

        const left = this.worldToScreenX(cx * chunkWorld)
        const top = this.worldToScreenY(cy * chunkWorld)
        const width = chunkWorld * this.scale
        const height = chunkWorld * this.scale * config.render.yScale
        // Ceil, so neighbouring chunks overlap by a fraction of a pixel rather
        // than leaving hairline seams between them.
        ctx.drawImage(chunk, Math.floor(left), Math.floor(top), Math.ceil(width) + 1, Math.ceil(height) + 1)
      }
    }

    return true
  }

  private readonly tints = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()

  /**
   * A solid-colour copy of a sheet — white for hit flashes, orange for
   * burning. Drawn over the sprite, it washes it without touching anything
   * around it. Made once per sheet and colour.
   */
  private tintOf(image: HTMLImageElement, colour: string): HTMLCanvasElement {
    let byColour = this.tints.get(image)
    if (!byColour) {
      byColour = new Map()
      this.tints.set(image, byColour)
    }
    let solid = byColour.get(colour)
    if (solid) return solid
    solid = document.createElement('canvas')
    solid.width = image.width
    solid.height = image.height
    const g = solid.getContext('2d')!
    g.drawImage(image, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = colour
    g.fillRect(0, 0, solid.width, solid.height)
    byColour.set(colour, solid)
    return solid
  }

  /**
   * Draw everything back-to-front by world Y, so things further "up" the
   * screen are further away and get overlapped by things in front of them.
   * This one sort is the entire 2.5D effect.
   */
  drawScene(items: Drawable[]): void {
    items.sort((a, b) => a.y - b.y)

    const { ctx } = this
    const { shadowAlpha, shadowWidthRatio, yScale } = config.render

    for (const item of items) {
      const sx = this.worldToScreenX(item.x)
      const sy = this.worldToScreenY(item.y)

      // Drawables are sized in world units; convert once, here, so nothing
      // that builds a draw list has to know what the current scale is.
      const w = item.w * this.scale
      const h = item.h * this.scale

      // Cheap culling. Endless world means most of it is off screen.
      if (sx + w < 0 || sx - w > this.viewW) continue
      if (sy + h < 0 || sy - h > this.viewH) continue

      const footprint = (item.shadowRadius ?? item.w / 2) * shadowWidthRatio * this.scale
      if (footprint > 0) {
        ctx.globalAlpha = shadowAlpha
        ctx.fillStyle = '#000000'
        ctx.beginPath()
        ctx.ellipse(sx, sy, footprint, footprint * yScale, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      if (item.sheet) {
        const { image, frameWidth, frameHeight } = item.sheet
        const alpha = item.alpha ?? 1
        ctx.globalAlpha = alpha
        const fx = (item.frameCol ?? 0) * frameWidth
        const fy = (item.frameRow ?? 0) * frameHeight
        const dx = Math.round(sx - w / 2)
        const dy = Math.round(sy - h)
        ctx.drawImage(image, fx, fy, frameWidth, frameHeight, dx, dy, Math.ceil(w), Math.ceil(h))
        if (item.tint && item.tintAmount && item.tintAmount > 0) {
          ctx.globalAlpha = alpha * Math.min(1, item.tintAmount)
          ctx.drawImage(this.tintOf(image, item.tint), fx, fy, frameWidth, frameHeight, dx, dy, Math.ceil(w), Math.ceil(h))
        }
        if (item.flash && item.flash > 0) {
          ctx.globalAlpha = alpha * Math.min(1, item.flash)
          ctx.drawImage(this.tintOf(image, '#ffffff'), fx, fy, frameWidth, frameHeight, dx, dy, Math.ceil(w), Math.ceil(h))
        }
        ctx.globalAlpha = 1
        continue
      }

      ctx.fillStyle = item.colour
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - h), w, h)
    }
  }

  /**
   * Generic world-space primitives, used by the debug overlays.
   *
   * They exist so debug drawing can live in its own file without reaching in
   * for the raw canvas context. The renderer stays ignorant of what's being
   * drawn and why.
   */
  fillWorldRect(worldX: number, worldY: number, worldW: number, worldH: number, colour: string, alpha = 1): void {
    const sx = this.worldToScreenX(worldX)
    const sy = this.worldToScreenY(worldY)
    const w = worldW * this.scale
    const h = worldH * config.render.yScale * this.scale
    if (sx + w < 0 || sx - w > this.viewW) return
    if (sy + h < 0 || sy - h > this.viewH) return

    const { ctx } = this
    ctx.globalAlpha = alpha
    ctx.fillStyle = colour
    ctx.fillRect(sx - w / 2, sy - h / 2, w, h)
    ctx.globalAlpha = 1
  }

  strokeWorldLine(x1: number, y1: number, x2: number, y2: number, colour: string, width = 1, alpha = 1): void {
    const { ctx } = this
    ctx.globalAlpha = alpha
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(this.worldToScreenX(x1), this.worldToScreenY(y1))
    ctx.lineTo(this.worldToScreenX(x2), this.worldToScreenY(y2))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  /**
   * Text standing up off a point on the ground, `lift` world units above it.
   *
   * Lift is a height, so it isn't squashed by yScale the way ground distances
   * are. Outlined in near-black so it stays readable over grass, sprites and
   * spell effects alike. `size` is in screen pixels and deliberately doesn't
   * zoom: numbers that shrank with the camera would be unreadable zoomed out.
   */
  drawWorldText(worldX: number, worldY: number, lift: number, text: string, colour: string, size: number, alpha = 1): void {
    const { ctx } = this
    const sx = this.worldToScreenX(worldX)
    const sy = this.worldToScreenY(worldY) - lift * this.scale
    ctx.globalAlpha = alpha
    ctx.font = `bold ${Math.round(size)}px ui-monospace, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#0b0f13'
    ctx.strokeText(text, sx, sy)
    ctx.fillStyle = colour
    ctx.fillText(text, sx, sy)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }

  /**
   * A round glowing ball hanging `lift` world units above a point on the
   * ground — a bolt in flight, an orb. Not squashed like ground circles,
   * because it isn't lying on the ground.
   */
  drawWorldOrb(worldX: number, worldY: number, radius: number, lift: number, colour: string, alpha = 1): void {
    const { ctx } = this
    const sx = this.worldToScreenX(worldX)
    const sy = this.worldToScreenY(worldY) - lift * this.scale
    const r = Math.max(1.5, radius * this.scale)
    ctx.globalAlpha = alpha * 0.35
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(sx, sy, r * 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = alpha * 0.75
    ctx.beginPath()
    ctx.arc(sx, sy, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /**
   * One frame of a sprite sheet standing on a point, lifted `lift` world units
   * off the ground — a bolt in flight drawn with real art rather than a glow.
   * Width and height are world units.
   */
  drawWorldSprite(sheet: SpriteSheet, frame: number, worldX: number, worldY: number, lift: number, w: number, h: number, alpha = 1): void {
    const { ctx } = this
    const sw = w * this.scale
    const sh = h * this.scale
    const sx = this.worldToScreenX(worldX) - sw / 2
    const sy = this.worldToScreenY(worldY) - lift * this.scale - sh / 2
    ctx.globalAlpha = alpha
    ctx.drawImage(sheet.image, frame * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight, Math.round(sx), Math.round(sy), Math.ceil(sw), Math.ceil(sh))
    ctx.globalAlpha = 1
  }

  /**
   * A frame stretched from one point to another, `thickness` world units
   * thick and lifted off the ground — a lightning arc between two enemies.
   */
  drawWorldBeam(sheet: SpriteSheet, frame: number, x1: number, y1: number, x2: number, y2: number, thickness: number, lift: number, alpha = 1): void {
    const { ctx } = this
    const ax = this.worldToScreenX(x1)
    const ay = this.worldToScreenY(y1) - lift * this.scale
    const bx = this.worldToScreenX(x2)
    const by = this.worldToScreenY(y2) - lift * this.scale
    const length = Math.hypot(bx - ax, by - ay)
    if (length < 1) return
    const h = thickness * this.scale
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(ax, ay)
    ctx.rotate(Math.atan2(by - ay, bx - ax))
    ctx.drawImage(sheet.image, frame * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight, 0, -h / 2, length, h)
    ctx.restore()
  }

  /** Filled, and squashed by yScale like the outline version below. */
  fillWorldCircle(worldX: number, worldY: number, radius: number, colour: string, alpha = 1): void {
    if (radius <= 0 || alpha <= 0) return
    const { ctx } = this
    ctx.globalAlpha = alpha
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.ellipse(
      this.worldToScreenX(worldX),
      this.worldToScreenY(worldY),
      radius * this.scale,
      radius * config.render.yScale * this.scale,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /** Squashed by yScale, so it reads as a circle lying on the ground. */
  strokeWorldCircle(worldX: number, worldY: number, radius: number, colour: string, width = 2, alpha = 1): void {
    const { ctx } = this
    ctx.globalAlpha = alpha
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(
      this.worldToScreenX(worldX),
      this.worldToScreenY(worldY),
      radius * this.scale,
      radius * config.render.yScale * this.scale,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  /**
   * A marker pinned to the screen edge pointing at something off-camera.
   *
   * Without it, a destination 1500 units away is completely invisible and
   * "why did he suddenly walk off?" is unanswerable by watching.
   */
  drawOffscreenMarker(worldX: number, worldY: number, colour: string): void {
    const sx = this.worldToScreenX(worldX)
    const sy = this.worldToScreenY(worldY)
    if (sx >= 0 && sx <= this.viewW && sy >= 0 && sy <= this.viewH) return

    const margin = 18
    const cx = this.viewW / 2
    const cy = this.viewH / 2
    const angle = Math.atan2(sy - cy, sx - cx)

    // Walk out from the centre until we hit the edge box.
    const halfW = cx - margin
    const halfH = cy - margin
    const scale = Math.min(Math.abs(halfW / Math.cos(angle)), Math.abs(halfH / Math.sin(angle)))

    const { ctx } = this
    ctx.fillStyle = colour
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(cx + Math.cos(angle) * scale, cy + Math.sin(angle) * scale, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /** Shown while the art decodes, so the first frame isn't an empty world. */
  drawLoading(message: string): void {
    const { ctx } = this
    ctx.fillStyle = config.render.backgroundColour
    ctx.fillRect(0, 0, this.viewW, this.viewH)
    ctx.fillStyle = '#9fb3c2'
    ctx.font = '14px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(message, this.viewW / 2, this.viewH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  /** Thin experience bar, sitting just above the health bar. */
  drawXpBar(fraction: number, level: number): void {
    const { ctx } = this
    const w = Math.min(420, this.viewW - 80)
    const x = (this.viewW - w) / 2
    const frame = getSheet('ui:bar_xp_frame')
    const fill = getSheet('ui:bar_xp_fill')
    const h = frame ? 12 : 5
    const y = this.viewH - 50
    if (frame && fill) {
      this.drawPixelBar(frame, fill, x, y, w, h, fraction)
    } else {
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#000000'
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#7dc4ff'
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h)
    }

    ctx.fillStyle = '#9fb3c2'
    ctx.font = '11px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText(`lv ${level}`, x - 38, y + h / 2)
  }

  /** Fixed health bar along the bottom of the screen. */
  drawHealthBar(fraction: number): void {
    const { ctx } = this
    const w = Math.min(420, this.viewW - 80)
    const x = (this.viewW - w) / 2
    const frame = getSheet('ui:bar_hp_frame')
    const fill = getSheet('ui:bar_hp_fill')
    const h = frame ? 16 : 10
    const y = this.viewH - 32
    const clamped = Math.max(0, Math.min(1, fraction))
    if (frame && fill) {
      this.drawPixelBar(frame, fill, x, y, w, h, clamped)
      return
    }

    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#000000'
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
    ctx.fillStyle = clamped > 0.5 ? '#3ddc84' : clamped > 0.2 ? '#e8c468' : '#ff4d5e'
    ctx.fillRect(x, y, w * clamped, h)
    ctx.strokeStyle = '#3a4a58'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
  }

  /**
   * A bar from pixel-art pieces: the empty frame stretched to the width, then
   * the fill over it, cut off at the fraction. Stretched in three parts so the
   * rounded ends keep their shape and only the middle grows.
   */
  private drawPixelBar(frame: SpriteSheet, fill: SpriteSheet, x: number, y: number, w: number, h: number, fraction: number): void {
    const { ctx } = this
    ctx.imageSmoothingEnabled = false
    this.drawThreeSlice(frame, x, y, w, h)
    const shown = Math.max(0, Math.min(1, fraction)) * w
    if (shown > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, shown, h)
      ctx.clip()
      this.drawThreeSlice(fill, x, y, w, h)
      ctx.restore()
    }
  }

  private drawThreeSlice(sheet: SpriteSheet, x: number, y: number, w: number, h: number): void {
    const cap = 3
    const scale = h / sheet.frameHeight
    const capW = cap * scale
    const middle = sheet.frameWidth - cap * 2
    const { ctx, } = this
    ctx.drawImage(sheet.image, 0, 0, cap, sheet.frameHeight, Math.round(x), y, Math.ceil(capW), h)
    ctx.drawImage(sheet.image, cap, 0, middle, sheet.frameHeight, Math.round(x + capW), y, Math.ceil(w - capW * 2), h)
    ctx.drawImage(sheet.image, sheet.frameWidth - cap, 0, cap, sheet.frameHeight, Math.round(x + w - capW), y, Math.ceil(capW), h)
  }

  /** Centred panel, for the death screen. */
  drawBanner(title: string, lines: string[]): void {
    const { ctx } = this
    const boxW = 340
    const boxH = 60 + lines.length * 22
    const x = (this.viewW - boxW) / 2
    const y = (this.viewH - boxH) / 2

    ctx.globalAlpha = 0.82
    ctx.fillStyle = '#0b0f13'
    ctx.fillRect(x, y, boxW, boxH)
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#3a4a58'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, boxW, boxH)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    ctx.fillStyle = '#e8c468'
    ctx.font = '20px ui-monospace, Consolas, monospace'
    ctx.fillText(title, x + boxW / 2, y + 20)

    ctx.fillStyle = '#9fb3c2'
    ctx.font = '13px ui-monospace, Consolas, monospace'
    lines.forEach((line, i) => {
      ctx.fillText(line, x + boxW / 2, y + 54 + i * 22)
    })

    ctx.textAlign = 'left'
  }

  /** Debug text, drawn in screen space on top of everything. */
  drawOverlay(lines: string[]): void {
    const { ctx } = this
    ctx.font = '12px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'top'

    const pad = 8
    const lineHeight = 16
    // Sized to the longest line rather than fixed, so a long spell name
    // doesn't run off the edge of its own background.
    let widest = 0
    for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width)
    const boxW = Math.max(210, Math.ceil(widest) + pad * 2)
    const boxH = pad * 2 + lines.length * lineHeight

    ctx.globalAlpha = 0.65
    ctx.fillStyle = '#000000'
    ctx.fillRect(pad, pad, boxW, boxH)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#8ce99a'
    lines.forEach((line, i) => {
      ctx.fillText(line, pad * 2, pad * 2 + i * lineHeight)
    })
  }
}
