// The spell tier rules, driven directly.
import { DEFAULT_CLASS } from '@game/data/classes'
import { currentOffers, takeOffer } from '@game/sim/draft'
import { pendingSpellTier, spellsOfTier, takeSpell } from '@game/sim/spellTiers'
import { createWorld } from '@game/sim/world'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`)
  if (!ok) failures++
}
const names = (tier: number) => spellsOfTier(DEFAULT_CLASS, tier).map((d) => d.displayName)
const owned = (w: ReturnType<typeof createWorld>) => w.weapons.map((x) => x.def.displayName)

check('tier 1 is the starting pick', names(1).join() === 'Firebolt,Frostbolt,Chain Lightning', names(1).join(', '))
check('shelved spells are in no tier', [1, 2, 3].every((t) => !spellsOfTier(DEFAULT_CLASS, t).some((d) => ['Frost Nova', 'Curse of Withering', 'Vortex', 'Entangling Roots'].includes(d.displayName))))

{
  const w = createWorld(1, 'spell_frostbolt_01')
  check('starts with the picked spell only', owned(w).join() === 'Frostbolt', owned(w).join())
  w.level = 5
  check('nothing pending before level 6', pendingSpellTier(w) === null)
  w.level = 6
  check('tier 2 pending at level 6', pendingSpellTier(w) === 2, `choices: ${names(2).join(', ')}`)
  const meteor = spellsOfTier(DEFAULT_CLASS, 3)[0]
  takeSpell(w, meteor)
  check('a tier-3 spell cannot be taken at tier 2', !owned(w).includes(meteor.displayName))
  takeSpell(w, spellsOfTier(DEFAULT_CLASS, 2)[0])
  check('taking a tier-2 spell closes tier 2', pendingSpellTier(w) === null && owned(w).length === 2, owned(w).join(', '))
  w.level = 15
  check('tier 3 pending at level 15', pendingSpellTier(w) === 3, `choices: ${names(3).join(', ')}`)
  const [first, second] = spellsOfTier(DEFAULT_CLASS, 3)
  takeSpell(w, second)
  takeSpell(w, first)
  check('taking one tier-3 spell locks out the other', owned(w).includes(second.displayName) && !owned(w).includes(first.displayName), owned(w).join(', '))
  check('nothing pending once every tier is chosen', pendingSpellTier(w) === null)
}
{
  const w = createWorld(1)
  w.level = 20
  check('tier 2 asked before tier 3 if both are open', pendingSpellTier(w) === 2)
  w.state = 'dead'
  check('no choice once he is dead', pendingSpellTier(w) === null)
}
{
  const w = createWorld(1)
  let spells = 0, cards = 0
  for (let i = 0; i < 60; i++) {
    w.pendingLevelUps = 1
    const offers = currentOffers(w)
    cards += offers.length
    spells += offers.filter((o) => (o as { kind: string }).kind !== 'upgrade').length
    if (offers[0]) takeOffer(w, offers[0])
  }
  check('level-ups never offer spells', spells === 0 && w.weapons.length === 1, `${cards} cards over 60 levels, ${spells} spells`)
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
