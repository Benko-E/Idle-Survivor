import type { MenuEntry, MenuNav, Screen } from './types'

/**
 * The main menu: shown on load and after every death, over the frozen world.
 *
 * Knows how to lay out entries and swap to a screen and back — nothing about
 * which entries exist or what their screens contain. Those live in entries.ts
 * and screens/.
 *
 * DOM rather than canvas, for the same reason as the draft: buttons and text
 * are what HTML is for, and it gives keyboard focus and Enter for free.
 */

const STYLES = `
.menu {
  position: fixed; inset: 0; z-index: 25;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 20px;
  background: rgba(6, 9, 12, 0.72);
  font: 13px ui-monospace, Consolas, monospace; color: #9fb3c2;
}
.menu[hidden] { display: none; }
.menu-title { margin: 0 0 4px; font-size: 28px; font-weight: normal; color: #e8c468; letter-spacing: 0.06em; }
.menu-subtitle { margin: 0 0 14px; }
.menu-view { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.menu-view[hidden] { display: none; }
.menu-button {
  width: 220px; padding: 11px 16px;
  border: 1px solid #3a4a58; border-radius: 6px;
  background: #121820; color: #e8c468; cursor: pointer;
  font: 15px ui-monospace, Consolas, monospace; letter-spacing: 0.04em;
}
.menu-button:hover, .menu-button:focus-visible { border-color: #e8c468; background: #18202a; outline: none; }
.menu-screen-body { min-width: 220px; min-height: 120px; text-align: center; }
.menu-placeholder { color: #5f7a8a; }
.menu-back { margin-top: 10px; }
.menu-choices { display: flex; flex-direction: column; gap: 10px; }
.menu-choice { width: 320px; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.menu-choice-name { font-size: 15px; color: #e8c468; }
.menu-choice-desc { font-size: 12px; color: #9fb3c2; line-height: 1.4; }
`

export interface MenuHost {
  play(starterId?: string): void
  /** Shown under the title, so banking is visible before anything spends it. */
  bankedGold(): number
}

export class Menu {
  private readonly root: HTMLDivElement
  private readonly subtitle: HTMLParagraphElement
  private readonly entryView: HTMLDivElement
  private readonly screenView: HTMLDivElement
  private readonly screenTitle: HTMLHeadingElement
  private readonly screenBody: HTMLDivElement
  private readonly heading: HTMLHeadingElement
  private readonly nav: MenuNav

  constructor(entries: MenuEntry[], private readonly host: MenuHost) {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)

    this.nav = {
      play: (starterId) => host.play(starterId),
      open: (screen) => this.openScreen(screen),
    }

    this.root = document.createElement('div')
    this.root.className = 'menu'
    this.root.hidden = true

    this.heading = document.createElement('h1')
    this.heading.className = 'menu-title'
    this.heading.textContent = 'Idle Survivor'

    this.subtitle = document.createElement('p')
    this.subtitle.className = 'menu-subtitle'

    this.entryView = document.createElement('div')
    this.entryView.className = 'menu-view'
    for (const entry of entries) {
      this.entryView.append(this.button(entry.label, () => entry.select(this.nav), entry.id))
    }

    this.screenView = document.createElement('div')
    this.screenView.className = 'menu-view'
    this.screenView.hidden = true
    this.screenTitle = document.createElement('h1')
    this.screenTitle.className = 'menu-title'
    this.screenBody = document.createElement('div')
    this.screenBody.className = 'menu-screen-body'
    const back = this.button('Back', () => this.showEntries())
    back.classList.add('menu-back')
    this.screenView.append(this.screenTitle, this.screenBody, back)

    this.root.append(this.heading, this.subtitle, this.entryView, this.screenView)
    document.body.appendChild(this.root)

    // Escape backs out of a screen. Listening on the menu itself, so the key
    // does nothing to the game or the debug panel while the menu is closed.
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.screenView.hidden) this.showEntries()
    })
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  show(): void {
    this.root.hidden = false
    this.showEntries()
  }

  hide(): void {
    this.root.hidden = true
  }

  private showEntries(): void {
    this.subtitle.textContent = `banked gold: ${Math.floor(this.host.bankedGold())}`
    this.heading.hidden = false
    this.subtitle.hidden = false
    this.screenView.hidden = true
    this.entryView.hidden = false
    // Focus the first entry, so Enter plays straight away.
    this.entryView.querySelector('button')?.focus()
  }

  private openScreen(screen: Screen): void {
    this.screenTitle.textContent = screen.title
    this.screenBody.replaceChildren()
    screen.build(this.screenBody, this.nav)

    this.heading.hidden = true
    this.subtitle.hidden = true
    this.entryView.hidden = true
    this.screenView.hidden = false
    this.screenView.querySelector<HTMLButtonElement>('.menu-back')?.focus()
  }

  private button(label: string, onClick: () => void, id?: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.className = 'menu-button'
    button.textContent = label
    if (id) button.dataset.entry = id
    button.addEventListener('click', onClick)
    return button
  }
}
