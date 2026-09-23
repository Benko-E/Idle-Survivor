/**
 * The shapes the menu is built from.
 *
 * An entry is a label plus what happens when you pick it. Most entries open a
 * screen; Play is simply the one that doesn't. Nothing in menu.ts knows which
 * entries exist, so adding one is a new screen file and a line in entries.ts.
 */

/** What an entry is allowed to do when picked. */
export interface MenuNav {
  /** Close the menu and start a fresh run. */
  play(): void
  /** Swap the entry list for a screen, with a way back. */
  open(screen: Screen): void
}

export interface MenuEntry {
  /** Stable handle, never shown. Display text lives in `label`. (spec 5.2) */
  id: string
  label: string
  select(nav: MenuNav): void
}

/**
 * A page reached from the menu: Options, Upgrades, a hall of fame one day.
 *
 * `build` fills an empty container and is called every time the screen opens,
 * so a screen showing live numbers (banked gold, say) is never stale.
 */
export interface Screen {
  id: string
  title: string
  build(body: HTMLElement): void
}
