import type { Screen } from '../types'
import { placeholder } from './placeholder'

export const optionsScreen: Screen = {
  id: 'options',
  title: 'Options',
  build(body) {
    placeholder(body, 'Nothing here yet.')
  },
}
