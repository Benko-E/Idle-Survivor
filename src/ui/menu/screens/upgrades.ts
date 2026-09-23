import type { Screen } from '../types'
import { placeholder } from './placeholder'

/** Where banked gold will be spent on permanent upgrades. */
export const upgradesScreen: Screen = {
  id: 'upgrades',
  title: 'Upgrades',
  build(body) {
    placeholder(body, 'Nothing here yet.')
  },
}
