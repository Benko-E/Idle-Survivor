import { config } from '../config'
import type { GameEvents } from '../sim/events'
import type { Renderer } from './renderer'

/**
 * Damage numbers floating up off enemies.
 *
 * Fed by the simulation's `enemyDamaged` event and nothing else, so the sim
 * has no idea they exist. Render-side state, so it's allowed its own
 * randomness for scatter without touching the run's seed.
 *
 * Hits on one enemy are merged over a short window before a number appears.
 * Damage over time lands every single frame; without merging, a cursed crowd
 * would fountain sixty numbers per enemy per second, and even direct hits
 * from several spells at once turn into an unreadable stack.
 */

const UNITS = ['', 'K', 'M', 'B', 'T']

/**
 * 847, 1.2K, 12.3K, 123K, 1.4M. Whole numbers below a thousand, then three
 * significant figures with a suffix, dropping a trailing ".0".
 */
export function formatDamage(amount: number): string {
  if (amount < 999.5) return String(Math.max(1, Math.round(amount)))
  let tier = Math.min(UNITS.length - 1, Math.floor(Math.log10(amount) / 3))
  let scaled = amount / Math.pow(1000, tier)
  // 999.96K would print as "1000K"; roll it over to "1M" instead.
  if (scaled >= 999.5 && tier < UNITS.length - 1) {
    tier++
    scaled /= 1000
  }
  const text = scaled >= 99.95 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '')
  return text + UNITS[tier]
}

interface Pending {
  amount: number
  x: number
  y: number
  colour: string
  age: number
  /** Show it now rather than waiting out the window: the enemy just died. */
  flush: boolean
}

interface Floater {
  text: string
  x: number
  y: number
  colour: string
  age: number
  size: number
  drift: number
}

export class DamageNumbers {
  private readonly pending = new Map<number, Pending>()
  private readonly floaters: Floater[] = []

  record(event: GameEvents['enemyDamaged']): void {
    if (!config.render.damageNumbers.enabled) return
    const existing = this.pending.get(event.enemyId)
    if (existing) {
      existing.amount += event.amount
      existing.x = event.x
      existing.y = event.y
      existing.colour = event.colour
      existing.flush ||= event.killed
      return
    }
    this.pending.set(event.enemyId, {
      amount: event.amount,
      x: event.x,
      y: event.y,
      colour: event.colour,
      age: 0,
      flush: event.killed,
    })
  }

  /** Advances with the simulation, so the menu freezes them mid-air. */
  update(dt: number): void {
    const settings = config.render.damageNumbers

    for (const [id, entry] of this.pending) {
      entry.age += dt
      if (!entry.flush && entry.age < settings.mergeSeconds) continue
      this.pending.delete(id)
      if (entry.amount < settings.minShown) continue

      // Bigger hits read bigger, gently: a thousand times the damage is about
      // one and a half times the size, not a thousand.
      const growth = 0.85 + 0.12 * Math.log10(Math.max(1, entry.amount))
      this.floaters.push({
        text: formatDamage(entry.amount),
        x: entry.x,
        y: entry.y,
        colour: entry.colour,
        age: 0,
        size: settings.fontSize * Math.min(1.6, Math.max(0.85, growth)),
        drift: (Math.random() - 0.5) * settings.scatter,
      })
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].age += dt
      if (this.floaters[i].age < settings.lifetime) continue
      this.floaters[i] = this.floaters[this.floaters.length - 1]
      this.floaters.pop()
    }

    // Past the cap the oldest go first; they're the most faded anyway.
    if (this.floaters.length > settings.maxOnScreen) {
      this.floaters.sort((a, b) => a.age - b.age)
      this.floaters.length = settings.maxOnScreen
    }
  }

  draw(renderer: Renderer): void {
    const settings = config.render.damageNumbers
    if (!settings.enabled) return

    for (const floater of this.floaters) {
      const t = floater.age / settings.lifetime
      // Quick rise that eases off, and a fade only in the last half, so the
      // number is fully readable for most of its life.
      const lift = settings.headHeight + settings.rise * (1 - (1 - t) * (1 - t))
      const alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2
      renderer.drawWorldText(floater.x + floater.drift, floater.y, lift, floater.text, floater.colour, floater.size, alpha)
    }
  }

  clear(): void {
    this.pending.clear()
    this.floaters.length = 0
  }
}
