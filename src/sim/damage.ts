import { config } from '../config'
import { damageMultiplier } from './difficulty'
import { gameEvents } from './events'
import { characterStat } from './stats'
import type { World } from './world'

/**
 * Contact damage and death. (spec B)
 *
 * Damage is continuous — every enemy overlapping the character deals its
 * contactDamage per second for as long as it's touching. No invulnerability
 * frames, deliberately: with i-frames a single fast enemy and a wall of thirty
 * do identical damage, and the whole point of the movement AI is that being
 * surrounded should be much worse than being clipped once.
 */
/**
 * The one place he loses health, scaled by the difficulty curve and his own
 * damage reduction. `amount` is already whatever this step's share is;
 * `source` is who to blame, kept in world.damageTakenBy for tuning.
 */
export function hurtCharacter(world: World, amount: number, source: string, self = false): void {
  if (world.state !== 'running' || amount <= 0) return
  const character = world.character
  // A multiplier stat, so "take 10% less damage" picks compound rather than
  // adding up: four of them leave him taking 66%, never 60% less and never
  // invulnerable.
  //
  // `self` is his own fire — Zealot's Pyre — which costs what it says, isn't
  // scaled by the difficulty curve, and isn't a hit: nothing that reacts to
  // him being hurt (Backdraft) fires on it.
  const taken = self ? 1 : characterStat(world, 'damageTaken', 1)
  const dealt = amount * (self ? 1 : damageMultiplier(world.time)) * taken
  character.hp -= dealt
  if (!self) world.lastHurtAt = world.time
  world.damageTakenBy[source] = (world.damageTakenBy[source] ?? 0) + dealt

  if (character.hp <= 0) {
    character.hp = 0
    world.state = 'dead'
    gameEvents.emit('died', { time: world.time, goldLost: world.gold })
  }
}

/** Contact damage this step by who's dealing it. Reused. */
const bySource = new Map<string, number>()

export function updateContactDamage(world: World, dt: number): void {
  const character = world.character
  let incoming = 0
  bySource.clear()

  // Standing in gas counts like being touched, for as long as he's in it.
  for (const hazard of world.hazards) {
    const reach = hazard.radius + character.radius * 0.5
    if ((hazard.x - character.x) ** 2 + (hazard.y - character.y) ** 2 > reach * reach) continue
    incoming += hazard.dps
    bySource.set('gas', (bySource.get('gas') ?? 0) + hazard.dps)
  }

  for (const enemy of world.enemies) {
    const dx = enemy.x - character.x
    const dy = enemy.y - character.y
    const reach = enemy.def.radius + character.radius
    if (dx * dx + dy * dy > reach * reach) continue

    incoming += enemy.def.contactDamage
    const name = enemy.def.displayName
    bySource.set(name, (bySource.get(name) ?? 0) + enemy.def.contactDamage)
  }

  world.incomingDps = incoming
  if (incoming === 0) return
  for (const [source, dps] of bySource) hurtCharacter(world, dps * config.damage.contactScale * dt, source)
}
