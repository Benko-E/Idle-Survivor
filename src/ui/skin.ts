/**
 * The interface skin: pixel-art window frames from the 7 Souls UI pack,
 * stretched with CSS border-image so any box can wear one.
 *
 *   skin-panel   dark window, rounded gold frame — cards, the menu, bubbles
 *   skin-gold    dark window, studded double gold frame — the spell choice
 *   skin-button  the matching pill — buttons
 *   skin-slot    a gold item slot — the spell bar
 *
 * Drawn at twice the art's pixel size and never smoothed, so the frames stay
 * as crisp as the sprites. The files come from tools/extract-art.ps1 into
 * art-source/ui/; without them these classes do nothing and every box keeps
 * its plain CSS look, so the game never depends on the art being there.
 */
const files = import.meta.glob('../../art-source/ui/*.png', { eager: true, import: 'default' }) as Record<string, string>

const byName = new Map<string, string>()
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()?.replace(/\.png$/, '')
  if (name) byName.set(name, url)
}

/** How many screen pixels per art pixel the frames are drawn at. */
const SCALE = 2

/**
 * One rule per frame: its image, how many art pixels of each edge are frame
 * (the rest stretches), and so how thick the border is on screen.
 */
function frameRule(className: string, file: string, slice: number): string {
  const url = byName.get(file)
  if (!url) return ''
  const border = slice * SCALE
  // Border set as separate properties, never the `border` shorthand: the
  // shorthand quietly resets border-image too, and with !important it wiped
  // the frame off every skinned box.
  return `
.${className} {
  border-style: solid !important;
  border-color: transparent !important;
  border-width: ${border}px !important;
  border-image: url("${url}") ${slice} fill / ${border}px stretch !important;
  image-rendering: pixelated;
  background: none !important;
  border-radius: 0 !important;
}`
}

let installed = false

/** Add the skin's CSS to the page. Safe to call more than once. */
export function installSkin(): void {
  if (installed) return
  installed = true
  const style = document.createElement('style')
  style.textContent = [
    frameRule('skin-panel', 'panel', 12),
    frameRule('skin-gold', 'panel_gold', 9),
    frameRule('skin-button', 'button', 7),
    // The frame is thick already; the old padding on top of it made tall buttons.
    byName.has('button') ? '.skin-button { padding-top: 1px !important; padding-bottom: 1px !important; }' : '',
    frameRule('skin-slot', 'slot', 5),
  ].join('\n')
  document.head.appendChild(style)
}

/** Whether the skin's art is present, for layouts that differ with it. */
export function skinAvailable(): boolean {
  return byName.has('panel')
}

let actions: HTMLDivElement | null = null

/**
 * The row the Level up and New spell! buttons live in: bottom centre, just
 * above the XP and health bars. Shared, so whichever buttons are showing sit
 * side by side instead of on top of each other.
 */
export function hudActions(): HTMLDivElement {
  if (actions) return actions
  const style = document.createElement('style')
  style.textContent = `
.hud-actions {
  position: fixed; left: 50%; bottom: 58px; transform: translateX(-50%); z-index: 10;
  display: flex; gap: 10px; align-items: center; pointer-events: none;
}
.hud-actions > * { pointer-events: auto; }`
  document.head.appendChild(style)
  actions = document.createElement('div')
  actions.className = 'hud-actions'
  document.body.appendChild(actions)
  return actions
}
