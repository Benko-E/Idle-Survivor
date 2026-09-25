import { config } from '../config'
import { auraRadius, isAura } from './auras'
import { forEachEnemyNear } from './enemyGrid'
import { weaponStat } from './stats'
import { activeWalls, crossesWall } from './walls'
import type { World } from './world'
import type { Zone } from './zones'

/**
 * Where his spells want the enemies to be, judged from where he'd stand.
 *
 * A spell with `engage` describes a shape around him — for an aura, the band
 * between a small circle just past his own body and the aura's edge; for a
 * breath or a cleave (later), a cone in front of him — and while he's
 * choosing a direction, each candidate is scored by how many enemies would
 * be inside that shape if he went that way. So "keep the pack in the fire"
 * is something he actually looks for, from his own point of view, and a cone
 * can care which way he'd be facing, which a map stamped from the enemies'
 * side can't.
 *
 * A wall spell's shape is the far side of its walls: the enemies that would
 * have to come through the fire to reach him if he stood there. That's Wall
 * Dancer — base Firewall has no `engage`, so it doesn't change how he moves.
 *
 * Only while he's farming, and only while he's healthy enough: the pull
 * fades between `engage.fadeFrom` and `engage.fadeTo` of his health, so a
 * mauling sends him away to recover rather than deeper in.
 */

export interface EngageShape {
  /**
   * ring: all the way round him. cone: in front, `halfAngle` either side of
   * his heading. wall: anything within `outer` whose way to him goes through
   * one of `walls`.
   */
  kind: 'ring' | 'cone' | 'wall'
  inner: number
  outer: number
  halfAngle: number
  /** How much he wants enemies in it, per enemy. */
  weight: number
  /** For 'wall': the walls they'd have to come through. */
  walls?: Zone[]
}

/** The shapes his spells want filled this frame. Empty when there's nothing to engage with. */
export function engagementShapes(world: World): EngageShape[] {
  const shapes: EngageShape[] = []
  if (world.intent !== 'farming') return shapes
  const keen = keenness(world)
  if (keen <= 0) return shapes
  for (const weapon of world.weapons) {
    if (!weapon.def.enabled) continue
    const engage = weaponStat(world, weapon, 'engage')
    if (engage <= 0) continue
    if (isAura(weapon)) {
      shapes.push({
        kind: 'ring',
        inner: world.character.radius * config.engage.bubble,
        outer: auraRadius(world, weapon),
        halfAngle: Math.PI,
        weight: engage * keen,
      })
    } else if (weapon.def.behaviour === 'wall') {
      const walls = activeWalls(world, weapon)
      if (walls.length > 0) {
        shapes.push({ kind: 'wall', inner: 0, outer: config.wall.dancerReach, halfAngle: Math.PI, weight: engage * keen, walls })
      }
    }
  }
  return shapes
}

/** 1 when he's healthy, easing to 0 as he's hurt: see engage.fadeFrom / fadeTo. */
export function keenness(world: World): number {
  const c = world.character
  const health = c.hp / Math.max(1, c.maxHp)
  const { fadeFrom, fadeTo } = config.engage
  return Math.max(0, Math.min(1, (health - fadeTo) / Math.max(1e-6, fadeFrom - fadeTo)))
}

/**
 * How many enemies would be in the shapes if he stood at (x, y) facing
 * (dirX, dirY), weighted per shape. Edges are soft, so an enemy drifting
 * across a boundary changes the score smoothly rather than flipping his
 * choice, and many enemies count for less than their number: the first few
 * in the fire matter most, and a giant blob isn't worth dying for.
 */
export function engagementAt(world: World, shapes: EngageShape[], x: number, y: number, dirX: number, dirY: number): number {
  let total = 0
  for (const shape of shapes) {
    const edge = Math.max(4, Math.min(config.engage.edge, (shape.outer - shape.inner) * 0.25))
    let count = 0
    forEachEnemyNear(world, x, y, shape.outer, (enemy) => {
      const dx = enemy.x - x
      const dy = enemy.y - y
      const d = Math.hypot(dx, dy)
      if (d >= shape.outer || d <= shape.inner) return
      let inside = Math.min(1, (d - shape.inner) / edge, (shape.outer - d) / edge)
      if (shape.kind === 'cone' && d > 0) {
        const cos = (dx * dirX + dy * dirY) / d
        const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
        inside = Math.min(inside, (shape.halfAngle - angle) / config.engage.edgeAngle)
      }
      if (shape.kind === 'wall' && !shape.walls?.some((wall) => crossesWall(wall, enemy.x, enemy.y, x, y))) return
      if (inside > 0) count += inside * inside * (3 - 2 * inside)
    })
    const cap = config.engage.softCap
    total += shape.weight * cap * (1 - Math.exp(-count / cap))
  }
  return total
}
