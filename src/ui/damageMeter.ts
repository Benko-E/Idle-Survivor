import { formatDamage } from '../render/damageNumbers'
import type { World } from '../sim/world'

/**
 * A damage meter, bottom left, the way raid meters do it: one flat bar per
 * spell in its own colour, biggest first. Click it to switch between damage
 * per second over the last minute and the total for the run.
 *
 * Read-only: it watches each spell's running `damageDealt` (everything the
 * spell caused — its bolts, forks, burns, blasts) and never touches the sim.
 * Per second is measured on the world's clock, so a paused draft doesn't drag
 * the numbers down.
 */

const STYLES = `
.damage-meter {
  position: fixed; left: 14px; bottom: 18px; z-index: 9; width: 150px;
  padding: 5px 6px 6px; border-radius: 6px; border: 1px solid #3a3222;
  background: #0d1218c4; color: #e8e2cf; cursor: pointer; user-select: none;
  font: 11px ui-monospace, Consolas, monospace;
}
.damage-meter[hidden] { display: none; }
.damage-meter:hover { border-color: #6b5a34; }
.damage-meter .meter-head { display: flex; justify-content: space-between; color: #e8c468; margin-bottom: 4px; }
.damage-meter .meter-head .mode { color: #9fb3c2; }
.damage-meter .meter-row { position: relative; height: 15px; margin-top: 2px; border-radius: 2px; overflow: hidden; background: #ffffff0d; }
.damage-meter .meter-bar { position: absolute; left: 0; top: 0; bottom: 0; opacity: 0.55; }
.damage-meter .meter-text { position: relative; display: flex; justify-content: space-between; padding: 0 4px; line-height: 15px; text-shadow: 0 1px 1px #000; }
.damage-meter .meter-text .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 6px; }
`

/**
 * Seconds the per-second figure is measured over. A minute, like the raid
 * meters: over five seconds every burst and lull swung the bars about.
 */
const WINDOW = 60
/** How often it samples and redraws, in world seconds. */
const SAMPLE = 0.25

type Mode = 'dps' | 'total'
const STORAGE_KEY = 'idle-survivor.damageMeter'

interface Sample {
  time: number
  totals: Map<string, number>
}

export class DamageMeter {
  private readonly root: HTMLDivElement
  private mode: Mode = 'dps'
  private world: World | null = null
  private samples: Sample[] = []
  private lastSampleAt = -Infinity
  /** World time each spell was first seen this run. */
  private firstSeen = new Map<string, number>()

  constructor() {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)
    this.root = document.createElement('div')
    this.root.className = 'damage-meter'
    this.root.hidden = true
    this.root.title = 'Click: per second (last minute) / this run'
    this.root.addEventListener('click', () => {
      this.mode = this.mode === 'dps' ? 'total' : 'dps'
      // A preference, nothing more: fine if the browser won't keep it.
      try {
        localStorage.setItem(STORAGE_KEY, this.mode)
      } catch {
        /* private window, blocked storage */
      }
      this.lastSampleAt = -Infinity
    })
    document.body.appendChild(this.root)
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'total') this.mode = 'total'
    } catch {
      /* ignore */
    }
  }

  /** Called every frame. `visible` is false over the menu. */
  update(world: World, visible: boolean): void {
    this.root.hidden = !visible
    if (!visible) return
    if (world !== this.world) {
      this.world = world
      this.samples = []
      this.lastSampleAt = -Infinity
      this.firstSeen.clear()
    }
    if (world.time - this.lastSampleAt < SAMPLE) return
    this.lastSampleAt = world.time

    const totals = new Map<string, number>()
    for (const weapon of world.weapons) {
      totals.set(weapon.def.id, weapon.damageDealt)
      if (!this.firstSeen.has(weapon.def.id)) this.firstSeen.set(weapon.def.id, world.time)
    }
    this.samples.push({ time: world.time, totals })
    while (this.samples.length > 1 && world.time - this.samples[0].time > WINDOW) this.samples.shift()

    this.draw(world, totals)
  }

  private draw(world: World, totals: Map<string, number>): void {
    const oldest = this.samples[0]
    const rows = world.weapons.map((weapon) => {
      const now = totals.get(weapon.def.id) ?? 0
      // Over the time the spell has had in the window, so one picked twenty
      // seconds ago isn't averaged over a minute it didn't exist for.
      const since = Math.max(oldest.time, this.firstSeen.get(weapon.def.id) ?? oldest.time)
      const span = Math.max(SAMPLE, world.time - since)
      const value = this.mode === 'total' ? now : (now - (oldest.totals.get(weapon.def.id) ?? 0)) / span
      return { name: weapon.def.displayName, colour: weapon.def.colour, value }
    })
    rows.sort((a, b) => b.value - a.value)
    const top = Math.max(1, rows[0]?.value ?? 1)
    const sum = rows.reduce((total, row) => total + row.value, 0)

    const head = document.createElement('div')
    head.className = 'meter-head'
    const mode = document.createElement('span')
    mode.className = 'mode'
    mode.textContent = this.mode === 'dps' ? 'per second' : 'this run'
    const total = document.createElement('span')
    total.textContent = formatDamage(sum)
    head.append(mode, total)

    const children: HTMLElement[] = [head]
    for (const row of rows) {
      const line = document.createElement('div')
      line.className = 'meter-row'
      const bar = document.createElement('div')
      bar.className = 'meter-bar'
      bar.style.width = `${(row.value / top) * 100}%`
      bar.style.background = row.colour
      const text = document.createElement('div')
      text.className = 'meter-text'
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = row.name
      const value = document.createElement('span')
      value.textContent = row.value > 0 ? formatDamage(row.value) : '0'
      text.append(name, value)
      line.append(bar, text)
      children.push(line)
    }
    this.root.replaceChildren(...children)
  }
}
