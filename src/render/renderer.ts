import { config } from '../config'

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
  colour: string
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private viewW = 0
  private viewH = 0

  /** Camera centre, in world coordinates. */
  readonly camera = { x: 0, y: 0 }

  /** Screen pixels per world unit. Recomputed on resize. */
  private scale = 1

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
    const { visibleWorldHeight, minScale, maxScale, yScale } = config.render
    const fitted = this.viewH / (visibleWorldHeight * yScale)
    this.scale = Math.max(minScale, Math.min(maxScale, fitted))
  }

  worldToScreenX(worldX: number): number {
    return (worldX - this.camera.x) * this.scale + this.viewW / 2
  }

  worldToScreenY(worldY: number): number {
    return (worldY - this.camera.y) * config.render.yScale * this.scale + this.viewH / 2
  }

  /** Clear and draw the ground plane. */
  beginFrame(): void {
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

      ctx.globalAlpha = shadowAlpha
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      ctx.ellipse(sx, sy, (w / 2) * shadowWidthRatio, (w / 2) * shadowWidthRatio * yScale, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1

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

  /** Thin experience bar, sitting just above the health bar. */
  drawXpBar(fraction: number, level: number): void {
    const { ctx } = this
    const w = Math.min(420, this.viewW - 80)
    const h = 5
    const x = (this.viewW - w) / 2
    const y = this.viewH - 44

    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#000000'
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1

    ctx.fillStyle = '#7dc4ff'
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h)

    ctx.fillStyle = '#9fb3c2'
    ctx.font = '11px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`lv ${level}`, x - 34, y + h + 2)
  }

  /** Fixed health bar along the bottom of the screen. */
  drawHealthBar(fraction: number): void {
    const { ctx } = this
    const w = Math.min(420, this.viewW - 80)
    const h = 10
    const x = (this.viewW - w) / 2
    const y = this.viewH - 34

    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#000000'
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1

    const clamped = Math.max(0, Math.min(1, fraction))
    ctx.fillStyle = clamped > 0.5 ? '#3ddc84' : clamped > 0.2 ? '#e8c468' : '#ff4d5e'
    ctx.fillRect(x, y, w * clamped, h)

    ctx.strokeStyle = '#3a4a58'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
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
    const boxW = 210
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
