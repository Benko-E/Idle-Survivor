import { config } from '../config'
import type { WeaponDef } from '../data/types'
import { damageEnemy } from './damageEnemy'
import { applyEffect } from './statusEffects'
import { enemiesInRadius, nearestEnemy } from './targeting'
import { spawnLine, spawnRing } from './vfx'
import type { Enemy, World } from './world'

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
  def: WeaponDef
  /** Base value from the data entry, resolved through all active modifiers. */
  stat: (key: string) => number
}

export type Behaviour = (context: CastContext) => void

/** Reused between casts so a busy frame doesn't allocate. */
const scratchTargets: Enemy[] = []

/**
 * Fires one or more travelling bolts at the nearest enemy.
 * Firebolt, and anything else that throws something.
 */
const projectile: Behaviour = ({ world, def, stat }) => {
  const caster = world.character
  const range = stat('range')

  const target = nearestEnemy(world, caster.x, caster.y, range)
  if (!target) return

  const count = Math.max(1, Math.round(stat('count')))
  const speed = stat('speed')
  const spread = stat('spread')
  const damage = stat('damage')
  const pierce = Math.max(0, Math.round(stat('pierce')))

  const baseAngle = Math.atan2(target.y - caster.y, target.x - caster.x)
  // Fan the extra bolts around the aim line rather than stacking them.
  const totalSpread = spread * (count - 1)

  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * totalSpread
    const angle = baseAngle + offset

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
    })
  }
}

/**
 * A burst centred on the caster that damages and chills everything caught in
 * it. Frost Nova, and any other "get away from me" spell.
 */
const nova: Behaviour = ({ world, def, stat }) => {
  const caster = world.character
  const area = stat('area')
  const damage = stat('damage')
  const slow = stat('slow')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  for (const enemy of targets) {
    damageEnemy(world, enemy, damage)
    if (slow > 0 && duration > 0) applyEffect(enemy, 'slow', slow, duration)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
}

/**
 * Strikes the nearest enemy, then leaps to the nearest enemy to *that* one,
 * losing power with each jump. Chain Lightning.
 */
const chain: Behaviour = ({ world, def, stat }) => {
  const caster = world.character
  const jumps = Math.max(1, Math.round(stat('count')))
  const jumpRange = stat('jumpRange')
  const falloff = stat('falloff')

  let current = nearestEnemy(world, caster.x, caster.y, stat('range'))
  if (!current) return

  const struck = new Set<number>()
  let damage = stat('damage')
  let fromX = caster.x
  let fromY = caster.y

  for (let jump = 0; jump < jumps && current; jump++) {
    struck.add(current.id)
    damageEnemy(world, current, damage)
    spawnLine(world, fromX, fromY, current.x, current.y, def.colour, config.combat.lineVfxSeconds)

    fromX = current.x
    fromY = current.y
    damage *= falloff
    current = nearestEnemy(world, current.x, current.y, jumpRange, struck)
  }
}

/**
 * Lays a lingering affliction on everything nearby. No immediate damage — it
 * all arrives over the duration. Curse of Withering.
 */
const curse: Behaviour = ({ world, def, stat }) => {
  const caster = world.character
  const area = stat('area')
  const dotDamage = stat('dotDamage')
  const duration = stat('duration')

  const targets = enemiesInRadius(world, caster.x, caster.y, area, scratchTargets)
  if (targets.length === 0) return

  for (const enemy of targets) {
    applyEffect(enemy, 'dot', dotDamage, duration)
  }

  spawnRing(world, caster.x, caster.y, area, def.colour, config.combat.ringVfxSeconds)
}

export const BEHAVIOURS: Record<string, Behaviour> = {
  projectile,
  nova,
  chain,
  curse,
}
