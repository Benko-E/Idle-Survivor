/**
 * Spell icons, by spell id.
 *
 * The files come from tools/extract-art.ps1 into art-source/icons/ (never
 * committed — see .gitignore). Vite inlines them into the built page like the
 * sprites. Picked up by name, so giving a new spell an icon is one line in the
 * extract script and nothing here.
 */
const files = import.meta.glob('../../art-source/icons/*.png', { eager: true, import: 'default' }) as Record<string, string>

const byId = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const id = path.split('/').pop()?.replace(/\.png$/, '')
  if (id) byId.set(id, url)
}

/** The icon's URL, or undefined for a spell without one. */
export function spellIconUrl(spellId: string): string | undefined {
  return byId.get(spellId)
}

/**
 * An icon element for a spell: the picture if there is one, otherwise a
 * plain badge in the spell's colour, so a new spell looks deliberate before
 * anyone has chosen its art.
 */
export function spellIcon(spellId: string, colour: string, size: number): HTMLElement {
  const url = spellIconUrl(spellId)
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.width = size
    img.height = size
    img.alt = ''
    img.draggable = false
    return img
  }
  const badge = document.createElement('span')
  badge.style.cssText = `display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${colour};`
  return badge
}
