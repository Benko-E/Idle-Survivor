import { buildOffers, takeOffer, type Offer } from '../sim/draft'
import type { World } from '../sim/world'

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
 * buildOffers and takeOffer.
 */

const STYLES = `
.draft-button {
  position: fixed; right: 18px; bottom: 18px; z-index: 10;
  padding: 10px 16px; border: 1px solid #e8c468; border-radius: 6px;
  background: #1a2028; color: #e8c468; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace; letter-spacing: 0.04em;
}
.draft-button:hover { background: #242c36; }
.draft-button[hidden] { display: none; }

.draft-panel {
  position: fixed; inset: 0; z-index: 20; display: flex;
  align-items: center; justify-content: center; gap: 14px;
  background: rgba(6, 9, 12, 0.72); padding: 20px; flex-wrap: wrap;
}
.draft-panel[hidden] { display: none; }

.draft-card {
  width: 210px; min-height: 130px; padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid #3a4a58; border-radius: 8px;
  background: #121820; cursor: pointer; text-align: left;
  font: 13px ui-monospace, Consolas, monospace; color: #9fb3c2;
}
.draft-card:hover { border-color: #e8c468; background: #18202a; }
.draft-card .kind { font-size: 11px; color: #5f7a4a; text-transform: uppercase; }
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
    this.button.className = 'draft-button'
    this.button.hidden = true
    this.button.addEventListener('click', () => this.show())
    document.body.appendChild(this.button)

    this.panel = document.createElement('div')
    this.panel.className = 'draft-panel'
    this.panel.hidden = true
    document.body.appendChild(this.panel)
  }

  private show(): void {
    const world = this.getWorld()
    if (world.pendingLevelUps <= 0) return

    const offers = buildOffers(world)
    if (offers.length === 0) return

    this.panel.replaceChildren()
    for (const offer of offers) {
      this.panel.appendChild(this.card(offer))
    }

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
    card.className = 'draft-card'

    const kind = document.createElement('span')
    kind.className = 'kind'
    kind.textContent = offer.kind === 'weapon' ? 'new spell' : 'upgrade'

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = offer.displayName

    const desc = document.createElement('span')
    desc.className = 'desc'
    desc.textContent = offer.description

    card.append(kind, name, desc)
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
    const pending = this.getWorld().pendingLevelUps

    this.button.hidden = pending <= 0 || this.open
    if (pending > 0) {
      this.button.textContent = pending > 1 ? `Level up  x${pending}` : 'Level up'
    }

    // A restart mid-draft would leave stale cards over a fresh run.
    if (this.open && pending <= 0) this.hide()
  }
}
