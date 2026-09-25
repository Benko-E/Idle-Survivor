// Righteous Fire's kit and the aura rules under it, through the real sim.
import { config } from '@game/config'
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { WEAPON_DEFS } from '@game/data/weapons'
import { auraBurn, auraRadius, pyreLit, updateAuras } from '@game/sim/auras'
import { updateCombat } from '@game/sim/combat'
import { damageEnemy } from '@game/sim/damageEnemy'
import { applyUpgrade } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { InfluenceMap } from '@game/sim/influenceMap'
import { hasCondition } from '@game/sim/statusEffects'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`)
  if (!ok) failures++
}
const rfDef = WEAPON_DEFS.find((def) => def.id === 'spell_aura_01')!
function withAura(ups: string[] = []): World {
  const w = createWorld(1)
  w.weapons.push({ def: rfDef, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 })
  for (const id of ups) applyUpgrade(w, UPGRADE_DEFS.find((def) => def.id === id)!)
  return w
}
const aura = (w: World) => w.weapons.find((x) => x.def.id === 'spell_aura_01')!
let nextId = 1
function enemy(w: World, x: number, y: number, hp = 1e9): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  w.enemies.push(e)
  return e
}

// The ring stamp: nothing in the middle, full in the band, nothing past it.
{
  const map = new InfluenceMap(10, 20)
  map.beginUpdate(0, 0)
  map.stampRing(0, 0, 40, 120, 1)
  const at = (x: number) => map.sample(x, 0)
  check('Ring: nothing inside the bubble', at(20) === 0, `${at(20).toFixed(2)}`)
  check('...full in the band', Math.abs(at(80) - 1) < 1e-9, `${at(80).toFixed(2)}`)
  check('...nothing past the edge', at(150) === 0, `${at(150).toFixed(2)}`)
}
// Zealot's Pyre: burns him, goes out below 30%, relit at full; only the pyre.
{
  const w = withAura(['up_rf_pyre'])
  const rf = aura(w)
  const plain = auraBurn(createWorldWithAura(), aura(createWorldWithAura()))
  check('Pyre lit: hotter burn', pyreLit(w, rf) && auraBurn(w, rf) > plain, `${plain} -> ${auraBurn(w, rf).toFixed(1)}`)
  const hp = w.character.hp
  updateAuras(w, 1)
  check('...and it burns him', w.character.hp < hp, `${hp} -> ${w.character.hp.toFixed(1)}`)
  check('...without counting as a hit (no Backdraft)', w.lastHurtAt === -Infinity)
  w.character.hp = w.character.maxHp * 0.29
  updateAuras(w, DT)
  check('Below 30%: the pyre goes out', !pyreLit(w, rf) && Math.abs(auraBurn(w, rf) - plain) < 1e-9, `burn ${auraBurn(w, rf)}`)
  w.character.hp = w.character.maxHp * 0.9
  updateAuras(w, DT)
  check('...stays out until he is healed', !pyreLit(w, rf))
  w.character.hp = w.character.maxHp
  updateAuras(w, DT)
  check('...relit at full health', pyreLit(w, rf))
}
function createWorldWithAura(): World {
  return withAura()
}
// Martyr's Fervour: hotter the more hurt he is.
{
  const w = withAura(['up_rf_fervour'])
  const full = auraBurn(w, aura(w))
  w.character.hp = w.character.maxHp * 0.3
  const hurt = auraBurn(w, aura(w))
  check("Martyr's Fervour: +70% at 30% health", Math.abs(hurt / full - 1.7) < 1e-9, `${full} -> ${hurt.toFixed(1)}`)
}
// Beacon: more damage from fire, and only from fire.
{
  const w = withAura(['up_rf_beacon'])
  w.weapons[0].cooldownRemaining = 99
  const e = enemy(w, 50, 0)
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  check('Beacon marks enemies in the aura', hasCondition(e, 'beaconed'))
  const before = e.hp
  damageEnemy(w, e, 100, w.weapons[0])
  const fire = before - e.hp
  const frost = { ...w.weapons[0], def: WEAPON_DEFS.find((def) => def.id === 'spell_frostbolt_01')! }
  const before2 = e.hp
  damageEnemy(w, e, 100, frost)
  check('...+15% from fire, nothing from frost', Math.abs(fire - 115) < 1e-9 && Math.abs(before2 - e.hp - 100) < 1e-9, `fire ${fire}, frost ${before2 - e.hp}`)
}
// Feed the Flames and Consuming Flames: kills inside feed it and heal him.
{
  const w = withAura(['up_rf_feed', 'up_rf_consume'])
  const rf = aura(w)
  const r0 = auraRadius(w, rf)
  w.character.hp = 50
  for (let i = 0; i < 4; i++) damageEnemy(w, enemy(w, 40 + i, 0, 1), 10, null)
  damageEnemy(w, enemy(w, 900, 0, 1), 10, null)
  check('Consuming Flames: healed per kill inside only', w.character.hp === 54, `hp 50 -> ${w.character.hp}`)
  for (let i = 0; i < 90; i++) updateAuras(w, DT)
  const grown = auraRadius(w, rf)
  check('Feed the Flames: the aura grows, eased', grown > r0 * 1.1 && grown < r0 * (1 + config.aura.feedMaxBonus), `${r0} -> ${grown.toFixed(0)}`)
  for (let i = 0; i < 60 * 12; i++) updateAuras(w, DT)
  check('...and settles back afterwards', Math.abs(auraRadius(w, rf) - r0) < 1, `${auraRadius(w, rf).toFixed(1)}`)
}
// Crown of Flames: smaller and far hotter.
{
  const w = withAura()
  w.level = config.draft.evolutionLevel
  const [r, burn] = [auraRadius(w, aura(w)), auraBurn(w, aura(w))]
  applyUpgrade(w, UPGRADE_DEFS.find((def) => def.id === 'up_rf_crown')!)
  check('Crown of Flames: 30% the size, 5x the burn', Math.abs(auraRadius(w, aura(w)) - r * 0.3) < 1e-9 && Math.abs(auraBurn(w, aura(w)) - burn * 5) < 1e-9)
}
// Zealotry: enemies inside carry a little aura that burns their neighbours.
{
  const w = withAura()
  applyUpgrade(w, UPGRADE_DEFS.find((def) => def.id === 'up_rf_zealotry')!)
  w.weapons[0].cooldownRemaining = 99
  const carrier = enemy(w, 60, 0)
  const neighbour = enemy(w, 60, 16)
  const outside = enemy(w, 400, 0)
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  const n0 = neighbour.hp
  outside.hp = outside.maxHp
  for (let i = 0; i < 30; i++) { w.time += DT; rebuildEnemyGrid(w); updateCombat(w, DT) }
  check('Zealotry: carriers catch it', hasCondition(carrier, 'zealotry'))
  check('...and burn their neighbours', neighbour.hp < n0 && outside.hp === outside.maxHp)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
