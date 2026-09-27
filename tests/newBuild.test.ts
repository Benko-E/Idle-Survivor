// The old/new build switch. Everything made before the spellbook redesign is
// the old build and is retired: a new-build run is offered none of it.
import { config } from '@game/config'
import { DEFAULT_CLASS } from '@game/data/classes'
import type { WeaponDef } from '@game/data/types'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { hasOffers, upgradeIsEligible } from '@game/sim/draft'
import { pendingSpellTier, spellsOfTier } from '@game/sim/spellTiers'
import { createWorld } from '@game/sim/world'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}
const ids = (tier: number) => spellsOfTier(DEFAULT_CLASS, tier).map((def) => def.id)
const OLD_SPELLS = ['spell_bolt_01', 'spell_frostbolt_01', 'spell_chain_01', 'spell_aura_01', 'spell_orb_01', 'spell_ball_01', 'spell_meteor_01', 'spell_wall_01', 'spell_blizzard_01', 'spell_storm_01']
const isNewSpell = (id?: string) => WEAPON_DEFS.some((def) => def.id === id && def.build === 'new')
const hardy = UPGRADE_DEFS.find((def) => def.id === 'up_vigour_01')!

// A stand-in new-build spell with no upgrades of its own, so the switch is
// tested on its own terms.
const newFire: WeaponDef = { ...WEAPON_DEFS.find((def) => def.id === 'spell_bolt_01')!, id: 'spell_test_newfire', build: 'new' }
WEAPON_DEFS.push(newFire)

check('the old spells are all marked old', OLD_SPELLS.every((id) => WEAPON_DEFS.find((def) => def.id === id)?.build === 'old'))
check('...and every upgrade is old, or for a new spell', UPGRADE_DEFS.every((def) => def.build === 'old' || isNewSpell(def.spellId)))

config.spells.oldBuild = true
check('old build: the three old starters', ['spell_bolt_01', 'spell_frostbolt_01', 'spell_chain_01'].every((id) => ids(1).includes(id)) && !ids(1).includes(newFire.id), ids(1).join(', '))

config.spells.oldBuild = false
check('new build: new spells only', ids(1).includes(newFire.id) && !ids(1).some((id) => OLD_SPELLS.includes(id)), ids(1).join(', '))
check('...no old spell in tiers 2 and 3 either', [2, 3].every((tier) => !ids(tier).some((id) => OLD_SPELLS.includes(id))), `${ids(2).join(', ')} | ${ids(3).join(', ')}`)

{
  const w = createWorld(1, newFire.id)
  w.level = 6
  check('...so no tier 2 choice with nothing new in it', pendingSpellTier(w) === null)
  check('...no old upgrade offered to a new run, not even Hardy', !UPGRADE_DEFS.some((def) => def.build === 'old' && upgradeIsEligible(w, def)))
  check('...and nothing to offer hides the level-up', !hasOffers(w))
}
{
  const w = createWorld(1, 'spell_bolt_01')
  check('an old run still gets old upgrades', upgradeIsEligible(w, hardy) && hasOffers(w))
}
{
  const w = createWorld(1)
  check('no pick: the default starter', w.weapons[0].def.id === config.character.defaultStarter, w.weapons[0].def.id)
}
{
  const w = createWorld(1, newFire.id)
  config.spells.oldBuild = true
  check('flipping the switch mid-run keeps his spells', w.weapons[0].def === newFire && w.weapons[0].def.enabled)
  config.spells.oldBuild = false
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
