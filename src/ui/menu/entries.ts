import { chooseSpellScreen, starterChoices } from './screens/chooseSpell'
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
  {
    id: 'play',
    label: 'Play',
    // A pick only when there's something to pick between.
    select: (nav) => {
      const choices = starterChoices()
      if (choices.length > 1) nav.open(chooseSpellScreen)
      else nav.play(choices[0]?.id)
    },
  },
  { id: 'options', label: 'Options', select: (nav) => nav.open(optionsScreen) },
  { id: 'upgrades', label: 'Upgrades', select: (nav) => nav.open(upgradesScreen) },
]
