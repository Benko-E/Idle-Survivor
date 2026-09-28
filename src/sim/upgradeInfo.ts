import { config } from '../config'
import { resolveStat, type Modifier } from '../core/modifiers'
import type { UpgradeDef } from '../data/types'
import { UPGRADE_DEFS } from '../data/upgrades'
import { partnerOf, upgradeModifiers } from './draft'
import { spellTags } from './stats'
import type { WeaponInstance, World } from './world'

/**
 * What a card's tooltip says beyond its own words, worked out from the run
 * as it stands: the numbers taking it would change, what it builds on, and
 * what it rules out. Nothing here is written per upgrade — the numbers come
 * from the same resolver every stat in the game goes through, so they can't
 * disagree with what the upgrade actually does.
 */

/**
 * How a number reads: `count` is a whole number of things (99 pierce is
 * "all"), `percent` a fraction shown out of 100, `times` a multiplier.
 */
export type NumberFormat = 'plain' | 'count' | 'percent' | 'times' | 'seconds'

/** One number an upgrade would change: "Firebolt · enemies pierced 1 → 2". */
export type StatChange = {
  /** The stat key, as the game reads it. */
  stat: string
  /** The spell whose stat it is; left out for his own stats. */
  spellId?: string
  /** The spell's name, to show when the upgrade isn't for one spell already. */
  spell?: string
  label: string
  before: number
  after: number
  format: NumberFormat
}

type StatInfo = {
  label: string | ((weapon: WeaponInstance) => string)
  /** The base when the spell's data doesn't list it — the fallback the game reads it with. */
  base?: number
  format: NumberFormat
}

/**
 * The spell stats worth a line, and how they read. A stat left out still
 * works; it just gets no number in the tooltip, and the upgrade's own
 * details have to say what it does (hot streaks, combustion, kilns).
 */
const SPELL_STATS: Record<string, StatInfo> = {
  damage: { label: 'damage', format: 'plain' },
  dotDamage: { label: 'damage over time', format: 'plain' },
  cooldown: { label: 'cooldown', format: 'seconds' },
  cooldownRecovery: { label: 'recharge speed', base: 1, format: 'percent' },
  range: { label: 'range', format: 'plain' },
  area: { label: 'area', format: 'plain' },
  count: {
    label: (weapon) => (weapon.def.behaviour === 'chain' || weapon.def.behaviour === 'arc' ? 'chain jumps' : weapon.def.behaviour === 'projectile' ? 'bolts' : 'count'),
    format: 'count',
  },
  pierce: { label: 'enemies pierced', format: 'count' },
  fork: { label: 'forks', format: 'count' },
  split: { label: 'extra bolts', format: 'count' },
  stoked: { label: 'heat per enemy passed', format: 'percent' },
  wintersBreath: { label: 'push per second', format: 'plain' },
  coldShoulder: { label: 'freeze when hit', format: 'seconds' },
  branch: { label: 'branches', format: 'count' },
  shock: { label: 'extra damage taken when shocked', format: 'percent' },
  staticDischarge: { label: 'arcs when hit', format: 'count' },
  falloff: { label: 'power kept per jump', format: 'percent' },
  slow: { label: 'slow', format: 'percent' },
  duration: { label: 'duration', format: 'seconds' },
  strikeRate: { label: 'strike rate', format: 'plain' },
  root: { label: 'root', format: 'seconds' },
  boltDamage: { label: 'bolt damage', base: 1, format: 'times' },
  boltSpeed: { label: 'bolt speed', base: 1, format: 'times' },
  boltSize: { label: 'bolt size', base: 1, format: 'times' },
  beacon: { label: 'fire damage taken', format: 'percent' },
  ignite: { label: 'burn, of each hit', format: 'percent' },
  backdraft: { label: 'bolts when hurt', format: 'count' },
  pyreDamage: { label: 'pyre heat', format: 'percent' },
  selfBurn: { label: 'burns him, per second', format: 'plain' },
  consume: { label: 'health per kill', format: 'plain' },
  feed: { label: 'growth per kill', format: 'percent' },
  coals: { label: 'coals, of the wall', format: 'percent' },
  embers: { label: 'embers per second', format: 'plain' },
  kiln: { label: 'bolt boost', format: 'percent' },
}

/** His own stats, with the base each is read against in sim/stats.ts. */
const CHARACTER_STATS: Record<string, { label: string; base: (world: World) => number; format: NumberFormat }> = {
  maxHp: { label: 'maximum health', base: (world) => world.classDef.stats.maxHp, format: 'plain' },
  hpRegen: { label: 'health per second', base: (world) => world.classDef.stats.hpRegen, format: 'plain' },
  damageTaken: { label: 'damage taken', base: () => 1, format: 'percent' },
  moveSpeed: { label: 'movement speed', base: (world) => world.classDef.stats.moveSpeed, format: 'plain' },
  pickupRadius: { label: 'pickup radius', base: () => config.pickups.collectRadius, format: 'plain' },
  xpGain: { label: 'experience', base: () => 1, format: 'percent' },
  goldGain: { label: 'gold', base: () => 1, format: 'percent' },
}

function changed(before: number, after: number): boolean {
  return Math.abs(after - before) > 1e-9
}

/**
 * Every number taking this upgrade would change right now, before and after,
 * for each of his spells it reaches. Stats it can't reach yet (+30% frost
 * damage with no frost spell) and stats with no line above are left out.
 */
export function upgradeChanges(world: World, def: UpgradeDef): StatChange[] {
  const added: Modifier[] = upgradeModifiers(def)
  const after = [...world.modifiers, ...added]
  const changes: StatChange[] = []

  const targets = [...new Set(added.map((modifier) => modifier.target))]
  for (const target of targets) {
    const own = CHARACTER_STATS[target]
    if (own) {
      const base = own.base(world)
      const before = resolveStat(base, target, world.modifiers)
      const next = resolveStat(base, target, after)
      if (changed(before, next)) changes.push({ stat: target, label: own.label, before, after: next, format: own.format })
      continue
    }

    const info = SPELL_STATS[target]
    if (!info) continue
    for (const weapon of world.weapons) {
      const tags = spellTags(world, weapon)
      const base = weapon.def.stats[target] ?? info.base ?? 0
      const before = resolveStat(base, target, world.modifiers, tags)
      const next = resolveStat(base, target, after, tags)
      if (!changed(before, next)) continue
      changes.push({
        stat: target,
        spellId: weapon.def.id,
        spell: def.spellId ? undefined : weapon.def.displayName,
        label: typeof info.label === 'function' ? info.label(weapon) : info.label,
        before,
        after: next,
        format: info.format,
      })
    }
  }

  return changes
}

/** Upgrades that must already be taken for this one: what it builds on. */
export function upgradeBuildsOn(def: UpgradeDef): UpgradeDef[] {
  return (def.requires ?? []).flatMap((id) => UPGRADE_DEFS.find((other) => other.id === id) ?? [])
}

/**
 * What taking this rules out for the rest of the run, that he could still
 * have had: what it retires, its either-or partner, and a spell's other
 * evolutions.
 */
export function upgradeLocksOut(world: World, def: UpgradeDef): UpgradeDef[] {
  const out: UpgradeDef[] = []
  const add = (other: UpgradeDef | undefined) => {
    if (!other || other === def || out.includes(other)) return
    if ((world.upgradesTaken[other.id] ?? 0) >= other.maxStacks) return
    out.push(other)
  }

  for (const id of def.retires ?? []) add(UPGRADE_DEFS.find((other) => other.id === id))
  add(partnerOf(def))
  if (def.kind === 'evolution' && def.spellId) {
    for (const other of UPGRADE_DEFS) {
      if (other.kind === 'evolution' && other.spellId === def.spellId) add(other)
    }
  }
  return out
}

/** Which pick this would be, and of how many: 2 of 3. */
export function upgradePick(world: World, def: UpgradeDef): { pick: number; of: number } {
  return { pick: (world.upgradesTaken[def.id] ?? 0) + 1, of: def.maxStacks }
}

/** A number the way a tooltip shows it. */
export function formatStat(value: number, format: NumberFormat): string {
  const trim = (n: number) => String(Math.round(n * 100) / 100)
  switch (format) {
    case 'count':
      return value >= 50 ? 'all' : trim(value)
    case 'percent':
      return `${Math.round(value * 100)}%`
    case 'times':
      return `×${trim(value)}`
    case 'seconds':
      return `${trim(value)}s`
    default:
      return trim(value)
  }
}
