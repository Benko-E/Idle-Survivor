import { optionsScreen } from './screens/options'
import { upgradesScreen } from './screens/upgrades'
import type { MenuEntry } from './types'

/**
 * The main menu, top to bottom.
 *
 * To add an entry — a hall of fame, achievements — write its screen in
 * screens/ and add a line here. Nothing else needs to change.
 */
export const MENU_ENTRIES: MenuEntry[] = [
  { id: 'play', label: 'Play', select: (nav) => nav.play() },
  { id: 'options', label: 'Options', select: (nav) => nav.open(optionsScreen) },
  { id: 'upgrades', label: 'Upgrades', select: (nav) => nav.open(upgradesScreen) },
]
