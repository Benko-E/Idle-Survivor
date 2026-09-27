import { currentOffers, draftBreakpoint, draftLevel, partnerOf, spellOfTier, takeOffer, type Offer } from '../sim/draft'
import { formatStat, upgradeBuildsOn, upgradeChanges, upgradeLocksOut, upgradePick } from '../sim/upgradeInfo'
import type { World } from '../sim/world'
import { hudActions } from './skin'
import { spellIcon, spellIconUrl } from './spellIcons'
import { Tooltip } from './tooltip'
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
 * Each card says one short line; the rest is in its tooltip — hover it, or
 * tap its ⓘ — with the numbers it would change, worked out from the run.
 * That keeps the cards narrow enough for five on a screen.
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
  flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 0 16px; pointer-events: none;
}
.draft-panel[hidden] { display: none; }
.draft-panel .draft-card, .draft-panel .draft-dismiss { pointer-events: auto; }
/* The cards' own row: stretch makes every card as tall as the tallest, so they
   line up without a fixed height that long text could overflow. */
.draft-row { display: flex; gap: 12px; align-items: stretch; justify-content: center; flex-wrap: wrap; }

/* A breakpoint level says what it's about. */
.draft-title {
  padding: 3px 12px; border-radius: 4px; background: #121820cc;
  font: 13px ui-monospace, Consolas, monospace; letter-spacing: 0.08em;
  text-transform: uppercase; color: #ffd98a;
}

.draft-card {
  position: relative; width: 210px; min-height: 110px; padding: 6px 8px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid #3a4a58; border-radius: 8px;
  background: #121820; cursor: pointer; text-align: left;
  font: 13px ui-monospace, Consolas, monospace; color: #9fb3c2;
}
.draft-card:hover, .draft-card:focus-visible { border-color: #e8c468; background: #18202a; filter: brightness(1.2); }
/* Skinned, the frame is part of the card's size, so the plain minimum is plenty. */
.draft-card.skin-panel { min-height: 0; justify-content: flex-start; }
.draft-card .kind { font-size: 11px; color: #7f9a6a; text-transform: uppercase; }
.draft-card.evolution .kind { color: #ffb347; }
.draft-card.evolution .name { color: #ffd98a; }
.draft-card .head { display: flex; gap: 10px; align-items: center; padding-right: 14px; }
.draft-card .head img, .draft-card .head > span:first-child { width: 44px; height: 44px; flex: none; border-radius: 4px; }
.draft-card .name { font-size: 15px; color: #e8c468; }
.draft-card .desc { line-height: 1.4; }
.draft-card .locks { font-size: 11px; color: #ff8a5c; }
/* The ⓘ: the tooltip for fingers, since a tap on the card takes it. */
.draft-card .info {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #5a6a78; border-radius: 50%; color: #9fb3c2;
  font: italic 12px Georgia, serif; line-height: 1;
}
.draft-card .info:hover { border-color: #e8c468; color: #e8c468; }

/* An either-or pair: two cards in one dashed frame with "or" between. */
.draft-pair {
  display: flex; gap: 6px; align-items: stretch; padding: 5px;
  border: 2px dashed #e8c468cc; border-radius: 10px; background: #0c1014b3;
}
.draft-or {
  align-self: center; padding: 3px 5px; border-radius: 4px; background: #121820;
  color: #e8c468; letter-spacing: 0.08em;
  font: 12px ui-monospace, Consolas, monospace; text-transform: uppercase;
}

.draft-dismiss {
  position: fixed; top: 18px; right: 18px;
  background: none; border: none; color: #9fb3c2; cursor: pointer;
  font: 13px ui-monospace, Consolas, monospace;
}

.tooltip .tip-name { font-size: 14px; color: #e8c468; }
.tooltip .tip-kind { font-size: 11px; color: #7f9a6a; text-transform: uppercase; }
.tooltip .tip-numbers { margin: 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.tooltip .tip-numbers b { color: #e8f0f6; font-weight: normal; }
.tooltip .tip-needs { color: #8fa0ae; }
.tooltip .tip-locks { color: #ff8a5c; }
`

function spellName(spellId: string | undefined): string | undefined {
  return spellId ? WEAPON_DEFS.find((def) => def.id === spellId)?.displayName : undefined
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  element.textContent = text
  return element
}

export class DraftUi {
  private readonly button: HTMLButtonElement
  private readonly panel: HTMLDivElement
  private readonly tooltip: Tooltip
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

    this.tooltip = new Tooltip()
  }

  private show(): void {
    const world = this.getWorld()
    if (world.pendingLevelUps <= 0) return

    const offers = currentOffers(world)
    if (offers.length === 0) return

    this.panel.replaceChildren()
    const title = this.title(world, offers)
    if (title) this.panel.appendChild(line('draft-title', title))

    const row = document.createElement('div')
    row.className = 'draft-row'
    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i]
      const next = offers[i + 1]
      // Pairs are dealt side by side, so a partner is always the next card.
      if (next && partnerOf(offer.def) === next.def) {
        const pair = document.createElement('div')
        pair.className = 'draft-pair'
        pair.append(this.card(offer), line('draft-or', 'or'), this.card(next))
        row.appendChild(pair)
        i++
        continue
      }
      row.appendChild(this.card(offer))
    }
    this.panel.appendChild(row)

    const dismiss = document.createElement('button')
    dismiss.className = 'draft-dismiss'
    dismiss.textContent = 'later'
    dismiss.addEventListener('click', () => this.hide())
    this.panel.appendChild(dismiss)

    this.panel.hidden = false
    this.open = true
  }

  /**
   * "Level 12 · Firebolt" on a breakpoint level, or null. Only what the
   * cards bear out: a focus that found nothing to deal isn't announced.
   */
  private title(world: World, offers: Offer[]): string | null {
    const breakpoint = draftBreakpoint(world)
    if (!breakpoint) return null
    const parts = [`Level ${draftLevel(world)}`]

    const tier = Math.round(breakpoint.spellTier ?? 0)
    const spellId = tier > 0 ? spellOfTier(world, tier) : undefined
    const kind = breakpoint.kind
    const matched = offers.some((offer) => (!spellId || offer.def.spellId === spellId) && (!kind || offer.def.kind === kind))
    if (matched && (spellId || kind)) {
      const kinds = kind === 'evolution' ? 'evolutions' : kind === 'mutation' ? 'mutations' : ''
      parts.push([spellName(spellId), kinds].filter(Boolean).join(' '))
    }
    const extra = Math.round(breakpoint.extraCards ?? 0)
    if (extra > 0) parts.push(`+${extra} card${extra > 1 ? 's' : ''}`)
    return parts.length > 1 ? parts.join(' · ') : null
  }

  private card(offer: Offer): HTMLElement {
    const world = this.getWorld()
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

    // An either-or card says so on its face, not only in the tooltip.
    const partner = partnerOf(offer.def)
    if (partner) card.appendChild(line('locks', `locks out ${partner.displayName}`))

    const info = document.createElement('span')
    info.className = 'info'
    info.textContent = 'i'
    info.setAttribute('aria-label', 'details')
    info.addEventListener('click', (event) => {
      // Not a pick: the card's own click never hears about it.
      event.stopPropagation()
      this.tooltip.pin(card, this.tipContent(world, offer))
    })
    card.appendChild(info)

    const tip = () => this.tooltip.show(card, this.tipContent(world, offer))
    card.addEventListener('mouseenter', tip)
    card.addEventListener('focus', tip)
    card.addEventListener('mouseleave', () => this.tooltip.hide())
    card.addEventListener('blur', () => this.tooltip.hide())
    card.addEventListener('click', () => {
      takeOffer(this.getWorld(), offer)
      this.hide()
    })

    return card
  }

  /** The long story: what it does, the numbers it changes, what it needs and rules out. */
  private tipContent(world: World, offer: Offer): Node[] {
    const def = offer.def
    const content: Node[] = [line('tip-name', def.displayName)]

    const spell = spellName(def.spellId)
    const { pick, of } = upgradePick(world, def)
    const kind = [spell, def.kind, of > 1 ? `pick ${pick} of ${of}` : ''].filter(Boolean).join(' · ')
    if (kind) content.push(line('tip-kind', kind))

    content.push(line('tip-details', def.details ?? def.description))

    const changes = upgradeChanges(world, def)
    if (changes.length > 0) {
      const list = document.createElement('ul')
      list.className = 'tip-numbers'
      for (const change of changes) {
        const item = document.createElement('li')
        const what = change.spell ? `${change.spell} ${change.label}` : change.label
        const value = document.createElement('b')
        value.textContent = `${formatStat(change.before, change.format)} → ${formatStat(change.after, change.format)}`
        item.append(`${what} `, value)
        list.appendChild(item)
      }
      content.push(list)
    }

    const needs = upgradeBuildsOn(def)
    if (needs.length > 0) content.push(line('tip-needs', `Builds on ${needs.map((other) => other.displayName).join(' and ')}`))
    const locks = upgradeLocksOut(world, def)
    if (locks.length > 0) content.push(line('tip-locks', `Rules out ${locks.map((other) => other.displayName).join(', ')} for this run`))

    return content
  }

  private hide(): void {
    this.panel.hidden = true
    this.open = false
    this.tooltip.hide(true)
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
