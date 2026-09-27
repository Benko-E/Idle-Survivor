/**
 * One floating tooltip, for anything that keeps its long story off the
 * screen until asked: the level-up cards now, the spell bar one day.
 *
 * Shown above what it's about, kept inside the window. Hovering shows it
 * and leaving hides it; `pin` keeps it up until pinned again or hidden, for
 * the ⓘ buttons — phones have no hover, and a tap on a card takes it.
 */

const STYLES = `
.tooltip {
  position: fixed; z-index: 40; box-sizing: border-box;
  width: 300px; max-width: calc(100vw - 32px); padding: 8px 10px;
  border: 1px solid #e8c468; border-radius: 6px; background: #121820;
  font: 13px ui-monospace, Consolas, monospace; line-height: 1.45; color: #c9d6e0;
  pointer-events: none; display: flex; flex-direction: column; gap: 6px;
}
.tooltip[hidden] { display: none; }
`

let installed = false

export class Tooltip {
  private readonly box: HTMLDivElement
  private anchor: HTMLElement | null = null
  private pinned = false

  constructor() {
    if (!installed) {
      installed = true
      const style = document.createElement('style')
      style.textContent = STYLES
      document.head.appendChild(style)
    }
    this.box = document.createElement('div')
    this.box.className = 'tooltip skin-panel'
    this.box.hidden = true
    document.body.appendChild(this.box)
  }

  /** Show `content` above `anchor`. Ignored while pinned to something else. */
  show(anchor: HTMLElement, content: Node[]): void {
    if (this.pinned && this.anchor !== anchor) return
    this.anchor = anchor
    this.box.replaceChildren(...content)
    this.box.hidden = false
    this.place()
  }

  /** Hide it, unless it's pinned — `force` hides it anyway. */
  hide(force = false): void {
    if (this.pinned && !force) return
    this.pinned = false
    this.anchor = null
    this.box.hidden = true
  }

  /** Pin it open over `anchor`, or unpin it if it's pinned there already. */
  pin(anchor: HTMLElement, content: Node[]): void {
    if (this.pinned && this.anchor === anchor) {
      this.hide(true)
      return
    }
    this.pinned = false
    this.show(anchor, content)
    this.pinned = true
  }

  /** Above the anchor, centred on it, never off the edge of the window. */
  private place(): void {
    if (!this.anchor) return
    const at = this.anchor.getBoundingClientRect()
    const size = this.box.getBoundingClientRect()
    const margin = 8
    const left = Math.min(Math.max(margin, at.left + at.width / 2 - size.width / 2), window.innerWidth - size.width - margin)
    // Below it only if there's no room above.
    const above = at.top - size.height - margin
    const top = above >= margin ? above : Math.min(at.bottom + margin, window.innerHeight - size.height - margin)
    this.box.style.left = `${Math.max(margin, left)}px`
    this.box.style.top = `${Math.max(margin, top)}px`
  }
}
