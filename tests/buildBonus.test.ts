// Build bonuses: pure, prismatic (Elemental Equilibrium), and neither.
import { ENEMY_DEFS } from '@game/data/enemies'
import { WEAPON_DEFS } from '@game/data/weapons'
import { bonusProspect } from '@game/sim/buildBonus'
import { damageEnemy } from '@game/sim/damageEnemy'
import { takeSpell } from '@game/sim/spellTiers'
import { weaponStat } from '@game/sim/stats'
import { createWorld, type Enemy } from '@game/sim/world'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(44)} ${detail}`)
  if (!ok) failures++
}
const def = (id: string) => WEAPON_DEFS.find((d) => d.id === id)!
function build(starter: string, second: string, third: string) {
  const w = createWorld(1, starter)
  w.level = 6
  takeSpell(w, def(second))
  const prospect = bonusProspect(w, 3)
  w.level = 15
  takeSpell(w, def(third))
  return { w, prospect }
}

{
  const { w, prospect } = build('spell_bolt_01', 'spell_aura_01', 'spell_wall_01')
  check('fire, fire: hint says Pure Fire 2/3', prospect?.bonus.kind === 'pure' && prospect.have === 2)
  const bolt = w.weapons[0], aura = w.weapons[1]
  check('three fire spells earn Pure Fire', w.buildBonus?.kind === 'pure' && (w.buildBonus as { element: string }).element === 'fire')
  check('Pure Fire: Firebolt hits 25% harder', Math.abs(weaponStat(w, bolt, 'damage') - 9 * 1.25) < 1e-9, `9 -> ${weaponStat(w, bolt, 'damage')}`)
  check('Pure Fire: Righteous Fire burns 25% hotter', Math.abs(weaponStat(w, aura, 'dotDamage') - 10 * 1.25) < 1e-9, `10 -> ${weaponStat(w, aura, 'dotDamage')}`)
}
{
  const { w } = build('spell_bolt_01', 'spell_aura_01', 'spell_storm_01')
  check('fire, fire, lightning earns nothing', w.buildBonus === null)
  check('...and adds no modifiers', w.modifiers.length === 0)
}
{
  const { w, prospect } = build('spell_bolt_01', 'spell_orb_01', 'spell_storm_01')
  check('fire, frost: hint says Prismatic 2/3', prospect?.bonus.kind === 'prismatic')
  check('one of each earns Prismatic', w.buildBonus?.kind === 'prismatic')
  const [fire, frost, lightning] = w.weapons
  const enemy: Enemy = { id: 99, def: ENEMY_DEFS[0], x: 0, y: 0, hp: 1e6, maxHp: 1e6, speed: 0, effects: [], stride: 0 }
  const hit = (source: typeof fire) => { const before = enemy.hp; damageEnemy(w, enemy, 10, source); return before - enemy.hp }
  const first = hit(fire)
  const sameAgain = hit(fire)
  const other = hit(frost)
  const third = hit(lightning)
  check('first hit: no bonus', first === 10, `${first}`)
  check('same element again: no bonus', sameAgain === 10, `${sameAgain}`)
  check('different element: +30%', Math.abs(other - 13) < 1e-9, `${other}`)
  check('another different element: +30% again', Math.abs(third - 13) < 1e-9, `${third}`)
  w.time += 3.1
  check('mark wears off after 3s', hit(fire) === 10)
}
{
  const w = createWorld(1, 'spell_bolt_01')
  const enemy: Enemy = { id: 98, def: ENEMY_DEFS[0], x: 0, y: 0, hp: 100, maxHp: 100, speed: 0, effects: [], stride: 0 }
  damageEnemy(w, enemy, 10, w.weapons[0])
  check('no bonus in a run without Prismatic', enemy.hp === 90)
}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
