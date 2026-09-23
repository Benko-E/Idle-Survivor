import { config } from '../config'
import type { WeaponDef } from '../data/types'
import { damageEnemy } from './damageEnemy'
import { applyEffect } from './statusEffects'
import { enemiesInRadius, nearestEnemies, nearestEnemy, pickTargets } from './targeting'
import { spawnLine, spawnRing } from './vfx'
import type { Enemy, WeaponInstance, World } from './world'

/**
 * The behaviour registry. (agreed extension to spec 5.1)
 *
 * This is the honest boundary of "content is data". A new spell that reuses an
 * existing pattern — a stronger firebolt, an ice shard, a triple-cast variant —
 * is a data entry and nothing else. A genuinely new *kind* of spell is a data
 * entry plus one function registered below.
 *
 * What matters is that nothing in here names a specific spell. Every function
 * reads its numbers from `stat()`, which resolves the caster's data entry
 * through the modifier system. 'projectile' has no idea it is usually Firebolt.
 */

export interface CastContext {
  world: World
  /** The spell being cast, credited with everything it causes. */
  weapon: WeaponInstance
  def: WeaponDef
  /** Base value from the data entry, resolved through all active modifiers. */
  stat: (key: string) => number
}

/**
 * Returns whether the cast actually did anything.
 *
 * A spell with nothing in range used to go on cooldown anyway: Chain
 * Lightning would fire at thin air, then sit out 2.7 seconds while an enemy
 * walked into range. Reporting a miss lets the caller keep the spell ready
 * instead, and stops empty casts inflating the per-spell cast counter that
 * exists to show when a spell never finds a target.
 */
export type Behaviour = (context: CastContext) => boolean

/** Reused between casts so a busy frame doesn't allocate. */
const scratchTargets: Enemy[] = []

/**
 * Fires one or more travelling bolts, each at a different nearby enemy.
 * Firebolt, and anything else that throws something.
 *
 * Extra bolts pick the next-nearest targets rather than fanning around one
 * aim line. The fan was so narrow that every bolt landed on the same enemy,
 * which turned "+1 projectile" into "+100% damage to one target" — by far the
 * strongest pick in the draft, and nothing like what it says. Only once there
 * are more bolts than targets do they double up, fanned by `spread`.
 */
const projectile: Behaviour = ({ world, weapon, def, stat }) => {
  const caster = world.character
  const range = stat('range')
  const count = Math.max(1, Math.round(stat('count')))

  const targets = nearestEnemies(world, caster.x, caster.y, range, count, scratchTargets)
  if (targets.length === 0) return false

  const speed = stat('speed')
  const spread = stat('spread')
  const damage = stat('damage')
  const pierce = Math.max(0, Math.round(stat('pierce')))

  // Whatever lingers on a hit: a chill if the spell slows, a burn if it has
  // damage over time. Neither for a plain bolt.
  const duration = stat('duration')
  const slow = stat('slow')
  const burn = stat('dotDamage')
  const onHit =
    duration <= 0
      ? null
      : slow > 0
        ? { kind: 'slow' as const, magnitude: slow, duration }
        : burn > 0
          ? { kind: 'dot' as const, magnitude: burn, duration }
          : null

  for (let i = 0; i < count; i++) {
    const target = targets[i % targets.length]
    // Bolts beyond the number of targets go round again, fanned out either
    // side of the line: +spread, -spread, +2 spread...
    const round = Math.floor(i / targets.length)
    const offset = round === 0 ? 0 : Math.ceil(round / 2) * spread * (round % 2 === 1 ? 1 : -1)
    const angle = Math.atan2(target.y - caster.y, target.x - caster.x) + offset

    world.projectiles.push({
      x: caster.x,
      y: caster.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      pierce,
      radius: config.combat.projectileRadius,
      colour: def.colour,
      tags: def.tags,
      life: speed > 0 ? range / speed : 0,
      hits: new Set(),
      source: weapon,
      onHit,
    })
  }

  return true
}

/**
 * A burst centred on the caster that damages and chills everything caught in
 * it. Frost Nova, and any other "get away from me" spell.
 */
const nova: Behaviour = ({ world, weapon, def, stat }) => {
  const caster = world.character
  const area = stat('area')
  const damage = stat('damage')
  const slow = stat('slow')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  // Held back until something is in reach, like every other spell. It used to
  // go off on its timer regardless, spending its cooldown on an empty ring.
  if (targets.length === 0) return false

  for (const enemy of targets) {
    damageEnemy(world, enemy, damage, weapon)
    if (slow > 0 && duration > 0) applyEffect(enemy, 'slow', slow, duration, weapon)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
  return true
}

/**
 * Strikes the nearest enemy, then leaps to the nearest enemy to *that* one,
 * losing power with each jump. Chain Lightning.
 */
const chain: Behaviour = ({ world, weapon, def, stat }) => {
  const caster = world.character
  const jumps = Math.max(1, Math.round(stat('count')))
  const jumpRange = stat('jumpRange')
  const falloff = stat('falloff')

  let current = nearestEnemy(world, caster.x, caster.y, stat('range'))
  if (!current) return false

  const struck = new Set<number>()
  let damage = stat('damage')
  let fromX = caster.x
  let fromY = caster.y

  for (let jump = 0; jump < jumps && current; jump++) {
    struck.add(current.id)
    damageEnemy(world, current, damage, weapon)
    spawnLine(world, fromX, fromY, current.x, current.y, def.colour, config.combat.lineVfxSeconds)

    fromX = current.x
    fromY = current.y
    damage *= falloff
    current = nearestEnemy(world, current.x, current.y, jumpRange, struck)
  }

  return true
}

/**
 * Lays a lingering affliction on everything nearby. No immediate damage — it
 * all arrives over the duration. Curse of Withering.
 */
const curse: Behaviour = ({ world, weapon, def, stat }) => {
  const caster = world.character
  const area = stat('area')
  const dotDamage = stat('dotDamage')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  if (targets.length === 0) return false

  for (const enemy of targets) {
    applyEffect(enemy, 'dot', dotDamage, duration, weapon)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
  return true
}

/**
 * A burn on everything within reach of him, refreshed every cooldown.
 * Righteous Fire. No ring on each refresh — it's drawn as a steady glow for as
 * long as he has it, because a pulse every 0.4s would be a strobe.
 */
const aura: Behaviour = ({ world, weapon, stat }) => {
  const caster = world.character
  const targets = enemiesInRadius(world, caster.x, caster.y, stat('area'), scratchTargets)
  if (targets.length === 0) return false

  const dotDamage = stat('dotDamage')
  const duration = stat('duration')
  for (const enemy of targets) applyEffect(enemy, 'dot', dotDamage, duration, weapon)
  return true
}

/**
 * Claims a patch of ground somewhere near him: a lightning strike, a meteor,
 * a vortex, roots. Everything about what the patch does is in its numbers;
 * see sim/zones.ts.
 */
const zone: Behaviour = ({ world, weapon, def, stat }) => {
  const caster = world.character
  const area = stat('area')
  const count = Math.max(1, Math.round(stat('count')))
  const targets = pickTargets(world, caster.x, caster.y, stat('range'), count, area, def.targeting ?? 'densest', scratchTargets)
  if (targets.length === 0) return false

  const delay = Math.max(0, stat('delay'))
  const duration = Math.max(0, stat('duration'))
  for (const target of targets) {
    world.zones.push({
      x: target.x,
      y: target.y,
      radius: area,
      delay,
      delayTotal: delay,
      remaining: duration,
      durationTotal: duration,
      burst: stat('damage'),
      dps: stat('dotDamage'),
      pull: stat('pull'),
      root: stat('root'),
      landed: false,
      colour: def.colour,
      source: weapon,
    })
  }
  return true
}

export const BEHAVIOURS: Record<string, Behaviour> = {
  projectile,
  nova,
  chain,
  curse,
  aura,
  zone,
}
