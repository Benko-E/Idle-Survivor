// For every upgrade: which numbers that the game actually reads does it change?
// Spells are cast once with a recording stat() to learn what each one reads,
// so this can't drift from the behaviour code.
import { config } from '@game/config'
import { DEFAULT_CLASS } from '@game/data/classes'
import { resolveStat } from '@game/core/modifiers'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { upgradeModifiers } from '@game/sim/draft'
import { WEAPON_DEFS } from '@game/data/weapons'
import { BEHAVIOURS } from '@game/sim/behaviours'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { createWorld } from '@game/sim/world'
import { ENEMY_DEFS } from '@game/data/enemies'

// Character-level stats and the base each call site passes. Extended as
// new ones get wired in; anything targeted but missing here is flagged.
const CHARACTER_STATS: Record<string, number> = {
  moveSpeed: DEFAULT_CLASS.stats.moveSpeed,
  maxHp: DEFAULT_CLASS.stats.maxHp,
  hpRegen: DEFAULT_CLASS.stats.hpRegen,
  pickupRadius: config.pickups.collectRadius,
  damageTaken: 1,
  xpGain: 1,
  goldGain: 1,
  ...JSON.parse(process.env.CHAR_STATS ?? '{}'),
}

const reads: Record<string, Set<string>> = {}
for (const def of WEAPON_DEFS) {
  const world = createWorld(1)
  world.enemies.push({ id: 1, def: ENEMY_DEFS[0], x: 60, y: 0, hp: 1e9, maxHp: 1e9, speed: 0, effects: [], stride: 0 })
  world.enemies.push({ id: 2, def: ENEMY_DEFS[0], x: 120, y: 0, hp: 1e9, maxHp: 1e9, speed: 0, effects: [], stride: 0 })
  rebuildEnemyGrid(world)
  const keys = new Set<string>(JSON.parse(process.env.COMBAT_KEYS ?? '["cooldown", "cooldownRecovery", "backdraft"]'))
  const landed = BEHAVIOURS[def.behaviour]({ world, weapon: { def, cooldownRemaining: 0, timesCast: 0, idleSeconds: 0, damageDealt: 0 }, caster: world.character, def, stat: (k) => { keys.add(k); return def.stats[k] ?? 0 } })
  reads[def.id] = keys
  console.log(`${def.displayName.padEnd(20)} reads: ${[...keys].join(', ')}${landed ? '' : '  (DID NOT CAST)'}`)
}
console.log()

for (const up of UPGRADE_DEFS) {
  const changes: string[] = []
  const targets = new Set(up.modifiers.map((m) => m.target))
  for (const def of WEAPON_DEFS) {
    for (const key of reads[def.id]) {
      const fallback = JSON.parse(process.env.FALLBACKS ?? '{"cooldownRecovery": 1}')[key] ?? 0
      const base = def.stats[key] ?? fallback
      const after = resolveStat(base, key, upgradeModifiers(up), [...def.tags, def.id, ...(up.spellId === def.id ? up.grantsTags ?? [] : [])])
      if (Math.abs(after - base) > 1e-9) { changes.push(`${def.displayName}.${key} ${+base.toFixed(3)}→${+after.toFixed(3)}`); targets.delete(key) }
      else if (targets.has(key) && def.stats[key] !== undefined) {/* targeted but tags excluded it */}
    }
  }
  for (const [key, base] of Object.entries(CHARACTER_STATS)) {
    const after = resolveStat(base, key, up.modifiers)
    if (Math.abs(after - base) > 1e-9) { changes.push(`character.${key} ${base}→${+after.toFixed(3)}`); targets.delete(key) }
  }
  const verdict = changes.length ? 'OK ' : 'NOTHING'
  console.log(`${verdict.padEnd(8)}${up.displayName.padEnd(20)} "${up.description}"`)
  for (const c of changes) console.log(`          ${c}`)
  for (const t of targets) console.log(`          !! targets '${t}' which nothing reads`)
}
