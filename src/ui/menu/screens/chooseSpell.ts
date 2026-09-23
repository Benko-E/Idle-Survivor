import { config } from '../../../config'
import { WEAPON_DEFS } from '../../../data/weapons'
import type { WeaponDef } from '../../../data/types'
import type { Screen } from '../types'

/**
 * The starting pick: one card per spell in `character.starterChoices`,
 * leaving out any that are switched off.
 */
export function starterChoices(): WeaponDef[] {
  return config.character.starterChoices
    .map((id) => WEAPON_DEFS.find((def) => def.id === id))
    .filter((def): def is WeaponDef => def !== undefined && def.enabled)
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
      card.append(name, description)
      card.addEventListener('click', () => nav.play(def.id))
      list.append(card)
    }
    body.append(list)
  },
}
