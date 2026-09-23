/**
 * The shapes the menu is built from.
 *
 * An entry is a label plus what happens when you pick it: open a screen, or
 * start a run. Play does whichever fits — the starting pick if there's a
 * choice to make, straight in if not. Nothing in menu.ts knows which entries
 * exist, so adding one is a new screen file and a line in entries.ts.
 */

/** What an entry is allowed to do when picked. */
export interface MenuNav {
  /**
   * Close the menu and start a fresh run, with this spell if given — or the
   * one picked last time, or the default.
   */
  play(starterId?: string): void
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
 * so a screen showing live numbers (banked gold, say) is never stale. It gets
 * the same navigation the entries do, so a screen can start a run or open
 * another screen.
 */
export interface Screen {
  id: string
  title: string
  build(body: HTMLElement, nav: MenuNav): void
}
