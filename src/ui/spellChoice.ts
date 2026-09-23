import { bonusFor, describeBonus, elementOf } from '../sim/buildBonus'
import { pendingSpellTier, spellsOfTier, takeSpell, tierCount } from '../sim/spellTiers'
import type { WeaponDef } from '../data/types'
import type { World } from '../sim/world'
import { hudActions } from './skin'
import { spellIcon } from './spellIcons'

/**
 * The tier choice: the one decision in a run that can't be taken back.
 *
 * Its own button, separate from level-ups and louder, because it matters
 * more — and like the draft it doesn't pause. He fights on with what he has
 * until you choose. The cards say plainly what each choice gives up.
 */

const STYLES = `
.spell-button {
  padding: 6px 14px; border: 1px solid #c9a6ff; border-radius: 6px;
  background: #1f1830; color: #e6d6ff; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace; letter-spacing: 0.04em;
  animation: spell-glow 1.6s ease-in-out infinite;
}
.spell-button[hidden] { display: none; }
@keyframes spell-glow {
  0%, 100% { box-shadow: 0 0 4px #c9a6ff66; }
  50% { box-shadow: 0 0 16px #c9a6ffcc; }
}

.spell-panel {
  position: fixed; inset: 0; z-index: 20;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 20px; background: rgba(6, 9, 12, 0.78);
  font: 13px ui-monospace, Consolas, monospace; color: #9fb3c2;
}
.spell-panel[hidden] { display: none; }
.spell-title { margin: 0; font-size: 22px; font-weight: normal; color: #e8c468; }
.spell-warning { margin: 0 0 6px; color: #d9a0a0; }
.spell-cards { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
.spell-card {
  width: 220px; min-height: 170px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 8px; text-align: left;
  border: 2px solid var(--element); border-radius: 8px;
  background: #121820; color: #9fb3c2; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace;
}
.spell-card:hover { background: #18202a; box-shadow: 0 0 14px var(--element); filter: brightness(1.2); }
.spell-card .element { font-size: 11px; text-transform: uppercase; color: var(--element); }
.spell-card img { width: 56px; height: 56px; border-radius: 6px; border: 1px solid var(--element); }
.spell-card .name { font-size: 16px; color: #e8c468; }
.spell-card .desc { line-height: 1.45; flex: 1; }
.spell-card .locks { font-size: 11px; color: #7a8a96; }
.spell-card .completes { font-size: 11px; color: #e8c468; }
.spell-card .completes.none { color: #6f8090; }
.spell-later {
  position: fixed; top: 18px; right: 18px;
  background: none; border: none; color: #9fb3c2; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace;
}
`

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth']

export class SpellChoiceUi {
  private readonly button: HTMLButtonElement
  private readonly panel: HTMLDivElement
  private openTier: number | null = null

  constructor(private readonly getWorld: () => World) {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)

    this.button = document.createElement('button')
    this.button.className = 'spell-button skin-button'
    this.button.textContent = 'New spell!'
    this.button.hidden = true
    this.button.addEventListener('click', () => this.show())
    hudActions().appendChild(this.button)

    this.panel = document.createElement('div')
    this.panel.className = 'spell-panel'
    this.panel.hidden = true
    document.body.appendChild(this.panel)
  }

  /** Open the choice, if one is waiting. The spell bar's empty slot uses this too. */
  show(): void {
    const tier = pendingSpellTier(this.getWorld())
    if (tier === null) return
    const choices = spellsOfTier(tier)

    const title = document.createElement('h2')
    title.className = 'spell-title'
    title.textContent = `Choose your ${ORDINAL[tier] ?? `tier ${tier}`} spell`

    const warning = document.createElement('p')
    warning.className = 'spell-warning'
    warning.textContent =
      choices.length > 1 ? `Choose one. The other${choices.length > 2 ? 's are' : ' is'} gone for this run.` : 'Only one choice this time.'

    const cards = document.createElement('div')
    cards.className = 'spell-cards'
    for (const def of choices) cards.appendChild(this.card(def, choices))

    const later = document.createElement('button')
    later.className = 'spell-later'
    later.textContent = 'later'
    later.addEventListener('click', () => this.hide())

    this.panel.replaceChildren(title, warning, cards, later)
    this.panel.hidden = false
    this.openTier = tier
  }

  private card(def: WeaponDef, all: WeaponDef[]): HTMLElement {
    const card = document.createElement('button')
    card.className = 'spell-card skin-gold'
    card.dataset.spell = def.id
    card.style.setProperty('--element', def.colour)

    const element = document.createElement('span')
    element.className = 'element'
    element.textContent = def.tags.find((tag) => tag === 'fire' || tag === 'frost' || tag === 'lightning') ?? 'spell'

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = def.displayName

    const desc = document.createElement('span')
    desc.className = 'desc'
    desc.textContent = def.description

    const locks = document.createElement('span')
    locks.className = 'locks'
    const others = all.filter((other) => other !== def).map((other) => other.displayName)
    locks.textContent = others.length ? `Locks out ${others.join(' and ')}` : ''

    card.append(spellIcon(def.id, def.colour, 56), element, name, desc, locks)

    // On the last choice, say what the set would come to.
    const world = this.getWorld()
    if (def.tier === tierCount()) {
      const bonus = bonusFor([...world.weapons.map((w) => elementOf(w.def)), elementOf(def)], tierCount())
      const completes = document.createElement('span')
      completes.className = bonus ? 'completes' : 'completes none'
      completes.textContent = bonus ? `Completes ${describeBonus(bonus).name}: ${describeBonus(bonus).effect}` : 'No build bonus'
      card.append(completes)
    }
    card.addEventListener('click', () => {
      takeSpell(this.getWorld(), def)
      this.hide()
    })
    return card
  }

  private hide(): void {
    this.panel.hidden = true
    this.openTier = null
  }

  /** Called every frame, like the draft's. */
  update(): void {
    const tier = pendingSpellTier(this.getWorld())
    this.button.hidden = tier === null || this.openTier !== null
    // The choice went away underneath an open panel — a restart, or death.
    if (this.openTier !== null && tier !== this.openTier) this.hide()
  }
}
