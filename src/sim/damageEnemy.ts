import { equilibriumMultiplier } from './buildBonus'
import { rollDrops } from './drops'
import { gameEvents, type GameEvents } from './events'
import { grantXp } from './progression'
import { characterStat } from './stats'
import type { Enemy, WeaponInstance, World } from './world'

/** Reused for every emit; this fires thousands of times a second. */
const payload: GameEvents['enemyDamaged'] = { enemyId: 0, x: 0, y: 0, amount: 0, colour: '', killed: false, overTime: false }

/**
 * The single place an enemy loses health.
 *
 * Its own tiny module rather than a method or a corner of combat.ts, because
 * everything that hurts things routes through it — projectiles, novas, chains,
 * damage over time — and so does everything that should happen on a kill.
 *
 * `source` is the spell responsible, however indirectly — the bolt it fired,
 * the curse it laid, the zone it left behind. It's how each spell's share of
 * the damage is known, and it's what colours the damage numbers.
 *
 * `overTime` marks a tick of damage over time rather than a hit — burning,
 * standing in a zone — for anything that only wants to react to real hits.
 *
 * Dead enemies are left in the array and swept up at the end of the combat
 * step. Removing mid-iteration would invalidate the neighbour grid that the
 * chain currently jumping between them is using.
 */
export function damageEnemy(world: World, enemy: Enemy, amount: number, source: WeaponInstance | null, overTime = false): void {
  if (enemy.hp <= 0 || amount <= 0) return
  amount *= equilibriumMultiplier(world, enemy, source)

  // Overkill doesn't count. A 400-damage meteor landing on a 10 hp enemy
  // dealt 10, and counting 400 would make slow heavy hitters look far better
  // than they are next to spells that spread their damage around.
  const dealt = Math.min(amount, enemy.hp)
  enemy.hp -= amount
  world.damageDealt += dealt
  if (source) source.damageDealt += dealt

  payload.enemyId = enemy.id
  payload.x = enemy.x
  payload.y = enemy.y
  payload.amount = amount
  payload.colour = source?.def.colour ?? '#ffffff'
  payload.killed = enemy.hp <= 0
  payload.overTime = overTime
  gameEvents.emit('enemyDamaged', payload)

  if (enemy.hp > 0) return

  enemy.hp = 0
  world.kills++

  // XP is awarded here rather than dropped, so it can never be left on the
  // floor. Tagged with the enemy's own tags, which is what makes a future
  // "+20% XP from undead" possible with no code.
  grantXp(world, characterStat(world, 'xpGain', enemy.def.xpValue, enemy.def.tags))

  rollDrops(world, enemy)
}
