import { config } from '../config'
import type { Renderer } from '../render/renderer'
import type { World } from '../sim/world'

/**
 * The wizard's thought bubble: a line of his inner monologue floating over his
 * head when something happens.
 *
 * Purely for show, and render-side: it watches the world for moments worth a
 * remark — levels, spells, banking, close calls — rather than the simulation
 * announcing them, so the sim stays exactly as it was. Randomness here is
 * Math.random; what he thinks has no bearing on the run.
 */

const STYLES = `
.thought {
  position: fixed; left: 0; top: 0; z-index: 8; pointer-events: none;
  max-width: 200px; padding: 2px 6px; background: #121820; border-radius: 6px;
  font: 12px ui-monospace, Consolas, monospace; line-height: 1.35; color: #e8e2cf;
  text-align: center; opacity: 0; transition: opacity 0.25s;
  transform: translate(-50%, -100%);
}
.thought.shown { opacity: 1; }
/* Thought, not speech: little bubbles trailing down to his head. */
.thought::before, .thought::after {
  content: ''; position: absolute; left: 50%; border-radius: 50%;
  background: #e8e2cf; box-shadow: 0 0 0 2px #121820;
}
.thought::before { width: 6px; height: 6px; bottom: -22px; margin-left: -9px; }
.thought::after { width: 4px; height: 4px; bottom: -31px; margin-left: -4px; }
`

interface Seen {
  level: number
  spells: number
  upgrades: number
  intent: World['intent']
  visits: number
  wasLow: boolean
  wasCritical: boolean
  crowded: boolean
  bigLoot: number
  bonus: boolean
  dead: boolean
  blasts: number
  inGas: boolean
}

export class ThoughtBubbles {
  private readonly bubble: HTMLDivElement
  private seen: Seen | null = null
  private world: World | null = null
  private lastThoughtAt = -Infinity
  private shownUntil = -Infinity
  private readonly momentReadyAt = new Map<string, number>()

  constructor() {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)
    this.bubble = document.createElement('div')
    this.bubble.className = 'thought skin-panel'
    document.body.appendChild(this.bubble)
  }

  /** Called every frame. `visible` is false over the menu. */
  update(world: World, renderer: Renderer, visible: boolean): void {
    if (!config.thoughts.enabled || !visible) {
      this.bubble.classList.remove('shown')
      return
    }
    // A new run: start watching it from scratch, and say hello.
    if (world !== this.world) {
      this.world = world
      this.seen = this.snapshot(world)
      this.lastThoughtAt = -Infinity
      this.shownUntil = -Infinity
      this.momentReadyAt.clear()
      this.consider('runStart', world)
    }

    this.watch(world)

    if (world.time > this.shownUntil) this.bubble.classList.remove('shown')
    else this.place(world, renderer)
  }

  private snapshot(world: World): Seen {
    const c = world.character
    let near = 0
    for (const e of world.enemies) if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 < 160 * 160) near++
    let bigLoot = 0
    for (const p of world.pickups) if (p.tier >= 2 && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < 360 * 360) bigLoot++
    const hp = c.hp / Math.max(1, c.maxHp)
    let inGas = false
    for (const h of world.hazards) if ((h.x - c.x) ** 2 + (h.y - c.y) ** 2 < h.radius * h.radius) inGas = true
    return {
      level: world.level,
      spells: world.weapons.length,
      upgrades: Object.values(world.upgradesTaken).reduce((sum, n) => sum + n, 0),
      intent: world.intent,
      visits: world.shopVisits,
      wasLow: hp < 0.3,
      wasCritical: hp < 0.2,
      crowded: near >= 22,
      bigLoot,
      bonus: world.buildBonus !== null,
      dead: world.state === 'dead',
      blasts: world.blastsTaken,
      inGas,
    }
  }

  /** Compare with last frame and react to whatever changed. */
  private watch(world: World): void {
    const before = this.seen!
    const now = this.snapshot(world)
    const hp = world.character.hp / Math.max(1, world.character.maxHp)

    if (now.dead && !before.dead) this.consider('died', world)
    else if (now.bonus && !before.bonus) this.consider(world.buildBonus?.kind === 'prismatic' ? 'bonusPrismatic' : 'bonusPure', world)
    else if (now.spells > before.spells) this.consider('newSpell', world)
    else if (now.upgrades > before.upgrades) this.consider('upgrade', world)
    else if (now.level > before.level) this.consider('levelUp', world)
    else if (now.intent === 'banking' && before.intent !== 'banking') this.consider(world.passingBy ? 'poppingIn' : 'goingToBank', world)
    else if (now.visits > before.visits) this.consider('banked', world)
    else if (now.blasts > before.blasts) this.consider('blasted', world)
    else if (now.inGas && !before.inGas) this.consider('gassed', world)
    else if (now.wasLow && !before.wasLow) this.consider('lowHealth', world)
    else if (now.crowded && !before.crowded) this.consider('crowd', world)
    else if (now.bigLoot > before.bigLoot) this.consider('bigLoot', world)
    else if (world.time - this.lastThoughtAt > config.thoughts.idleSeconds) this.consider('idle', world)

    // A close call: badly hurt, then back on his feet. Remembered until he
    // recovers, so it isn't forgotten while he's still limping.
    const critical = before.wasCritical || hp < 0.2
    if (critical && hp > 0.6) {
      this.consider('closeCall', world)
      now.wasCritical = false
    } else now.wasCritical = critical

    this.seen = now
  }

  private consider(moment: string, world: World): void {
    const entry = world.classDef.thoughts[moment]
    if (!entry || entry.lines.length === 0) return
    const gap = entry.urgent ? config.thoughts.urgentGapSeconds : config.thoughts.minGapSeconds
    if (world.time - this.lastThoughtAt < gap) return
    if (world.time < (this.momentReadyAt.get(moment) ?? -Infinity)) return
    if (Math.random() > entry.chance) return

    const line = entry.lines[Math.floor(Math.random() * entry.lines.length)]
    this.bubble.textContent = line
    this.bubble.classList.add('shown')
    this.lastThoughtAt = world.time
    // Longer lines stay up a little longer, so they can be read.
    this.shownUntil = world.time + config.thoughts.showSeconds + line.length * 0.03
    this.momentReadyAt.set(moment, world.time + entry.cooldown)
  }

  /** Over his head, wherever he is on screen. */
  private place(world: World, renderer: Renderer): void {
    const c = world.character
    const x = renderer.worldToScreenX(c.x)
    const y = renderer.worldToScreenY(c.y) - (world.classDef.drawHeight + 22) * renderer.unitScale
    this.bubble.style.left = `${Math.round(x)}px`
    this.bubble.style.top = `${Math.round(y)}px`
  }
}
