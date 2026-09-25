import { currentOffers, takeOffer, type Offer } from '../sim/draft'
import type { World } from '../sim/world'
import { hudActions } from './skin'
import { spellIcon, spellIconUrl } from './spellIcons'
import { WEAPON_DEFS } from '../data/weapons'

/**
 * The level-up draft. The only interactive thing in the game.
 *
 * Deliberately does *not* pause. Pausing on level-up exists to protect a
 * player who is mid-fight and would otherwise die while reading cards —
 * nobody here is under that pressure, because the character fights on
 * perfectly well without supervision. So levels queue up on a button and you
 * open them when you feel like it.
 *
 * DOM rather than canvas: this is a list of clickable cards with text, which
 * is what HTML is for. Nothing here touches the simulation except through
 * currentOffers and takeOffer.
 */

const STYLES = `
.draft-button {
  padding: 6px 14px; border: 1px solid #e8c468; border-radius: 6px;
  background: #1a2028; color: #e8c468; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace; letter-spacing: 0.04em;
}
.draft-button:hover { background: #242c36; }
.draft-button[hidden] { display: none; }

/* A strip just above the XP bar rather than a dimmed screen: the fight stays
   in view while you choose, and only the cards themselves catch the mouse. */
.draft-panel {
  position: fixed; left: 0; right: 0; bottom: 62px; z-index: 20; display: flex;
  align-items: flex-end; justify-content: center; gap: 14px;
  padding: 0 20px; flex-wrap: wrap; pointer-events: none;
}
.draft-panel[hidden] { display: none; }
.draft-panel .draft-card, .draft-panel .draft-dismiss { pointer-events: auto; }
/* The cards' own row: stretch makes every card as tall as the tallest, so they
   line up without a fixed height that long text could overflow. */
.draft-row { display: flex; gap: 14px; align-items: stretch; justify-content: center; flex-wrap: wrap; }

.draft-card {
  width: 250px; min-height: 130px; padding: 6px 8px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid #3a4a58; border-radius: 8px;
  background: #121820; cursor: pointer; text-align: left;
  font: 13px ui-monospace, Consolas, monospace; color: #9fb3c2;
}
.draft-card:hover { border-color: #e8c468; background: #18202a; filter: brightness(1.2); }
/* Skinned, the frame is part of the card's size, so the plain minimum is plenty. */
.draft-card.skin-panel { min-height: 0; justify-content: flex-start; }
.draft-card .kind { font-size: 11px; color: #7f9a6a; text-transform: uppercase; }
.draft-card.evolution .kind { color: #ffb347; }
.draft-card.evolution .name { color: #ffd98a; }
.draft-card .head { display: flex; gap: 10px; align-items: center; }
.draft-card .head img, .draft-card .head > span:first-child { width: 44px; height: 44px; flex: none; border-radius: 4px; }
.draft-card .name { font-size: 15px; color: #e8c468; }
.draft-card .desc { line-height: 1.45; }

.draft-dismiss {
  position: fixed; top: 18px; right: 18px;
  background: none; border: none; color: #9fb3c2; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace;
}
`

export class DraftUi {
  private readonly button: HTMLButtonElement
  private readonly panel: HTMLDivElement
  private open = false

  constructor(private getWorld: () => World) {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)

    this.button = document.createElement('button')
    this.button.className = 'draft-button skin-button'
    this.button.hidden = true
    this.button.addEventListener('click', () => this.show())
    hudActions().appendChild(this.button)

    this.panel = document.createElement('div')
    this.panel.className = 'draft-panel'
    this.panel.hidden = true
    document.body.appendChild(this.panel)
  }

  private show(): void {
    const world = this.getWorld()
    if (world.pendingLevelUps <= 0) return

    const offers = currentOffers(world)
    if (offers.length === 0) return

    this.panel.replaceChildren()
    const row = document.createElement('div')
    row.className = 'draft-row'
    for (const offer of offers) row.appendChild(this.card(offer))
    this.panel.appendChild(row)

    const dismiss = document.createElement('button')
    dismiss.className = 'draft-dismiss'
    dismiss.textContent = 'later'
    dismiss.addEventListener('click', () => this.hide())
    this.panel.appendChild(dismiss)

    this.panel.hidden = false
    this.open = true
  }

  private card(offer: Offer): HTMLElement {
    const card = document.createElement('button')
    card.className = 'draft-card skin-panel'

    const kind = document.createElement('span')
    kind.className = 'kind'
    // Which kind of card, so the slots' leanings read at a glance: an upgrade
    // for one spell names the spell, and an evolution says so.
    const spell = offer.def.spellId ? WEAPON_DEFS.find((def) => def.id === offer.def.spellId) : undefined
    kind.textContent = spell
      ? `${offer.def.kind === 'evolution' ? 'evolution · ' : ''}${spell.displayName}`
      : offer.def.tags.includes('defence') ? 'defence' : offer.def.tags.includes('utility') ? 'utility' : 'power'
    if (offer.def.kind === 'evolution') card.classList.add('evolution')

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = offer.displayName

    const desc = document.createElement('span')
    desc.className = 'desc'
    desc.textContent = offer.description

    const head = document.createElement('span')
    head.className = 'head'
    const label = document.createElement('span')
    label.style.cssText = 'display:flex;flex-direction:column;gap:3px'
    label.append(kind, name)
    // Its own icon if it has one, otherwise its spell's.
    const iconId = spellIconUrl(offer.id) || !spell ? offer.id : spell.id
    head.append(spellIcon(iconId, spell?.colour ?? '#e8c468', 44), label)
    card.append(head, desc)
    card.addEventListener('click', () => {
      takeOffer(this.getWorld(), offer)
      this.hide()
    })

    return card
  }

  private hide(): void {
    this.panel.hidden = true
    this.open = false
  }

  /** Called every frame. Keeps the button's label and visibility honest. */
  update(): void {
    // Nothing to spend once he's dead: the levels die with the run.
    const world = this.getWorld()
    const pending = world.state === 'running' ? world.pendingLevelUps : 0

    this.button.hidden = pending <= 0 || this.open
    if (pending > 0) {
      this.button.textContent = pending > 1 ? `Level up  x${pending}` : 'Level up'
    }

    // A restart mid-draft would leave stale cards over a fresh run.
    if (this.open && pending <= 0) this.hide()
  }
}
