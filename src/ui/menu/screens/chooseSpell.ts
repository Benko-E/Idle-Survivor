import type { WeaponDef } from '../../../data/types'
import { spellsOfTier } from '../../../sim/spellTiers'
import { spellIcon } from '../../spellIcons'
import type { Screen } from '../types'

/** The starting pick: every enabled tier-1 spell. */
export function starterChoices(): WeaponDef[] {
  return spellsOfTier(1)
}

export const chooseSpellScreen: Screen = {
  id: 'choose-spell',
  title: 'Choose your first spell',
  build(body, nav) {
    const list = document.createElement('div')
    list.className = 'menu-choices'
    for (const def of starterChoices()) {
      const card = document.createElement('button')
      card.className = 'menu-button menu-choice'
      card.dataset.spell = def.id
      const name = document.createElement('span')
      name.className = 'menu-choice-name'
      name.textContent = def.displayName
      const description = document.createElement('span')
      description.className = 'menu-choice-desc'
      description.textContent = def.description
      const text = document.createElement('span')
      text.className = 'menu-choice-text'
      text.append(name, description)
      card.append(spellIcon(def.id, def.colour, 48), text)
      card.addEventListener('click', () => nav.play(def.id))
      list.append(card)
    }
    body.append(list)
  },
}
