# Phase 1: Build Switch and the New Firebolt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire every old spell and every old upgrade behind a build switch, and add the new build's Firebolt with its generic bolt upgrades and its five mutations (evolutions are Phase 2).

**Architecture:** Spells and upgrades get an optional `build: 'old' | 'new'`, and everything that exists today is marked `'old'`. `spellsOfTier` offers only the active build's spells (no borrowing), and old upgrades are offered only to a run that owns an old spell, so a new-build run sees nothing old at all. An empty draft hides the level-up button. The new Firebolt (`spell_firebolt_01`) reuses the `projectile` behaviour. New mechanics (Kindling, Split Shot, white-hot Hot Streak, Accelerating Bolt, Stoked) are switched on by new spell stats, so the old spells never see them. The generic bolt list is a template function that gives each spell its own copies.

**Tech Stack:** TypeScript, Vite, the game's own test runner (`npm test`: each `tests/*.test.ts` is bundled and run in its own Node process; a test fails if it prints `FAIL` or exits non-zero).

**Spec:** the spellbook (https://claude.ai/artifact/AKfux2VDnpPyZe47TsCZ9J, Version 12): the Firebolt entry, "Generic bolt upgrades", Design rules. Roadmap: `plans/2026-09-28-new-build-roadmap.md`.

## Global Constraints

- Card lines (`description`) are **45 characters at most** (test-enforced).
- **Spawns are plain:** forks and Backdraft bolts get the base hit (or a share of it) and none of the spell's mutations.
- Tier 1 leaves **nothing behind** on the ground.
- Base spells **don't change his AI**; none of this phase touches movement.
- **The old build keeps working:** every existing test stays green (tests about the old roster switch themselves to the old build), and no old spell's behaviour changes.
- **Everything old is retired** (user, 2026-09-28): a new-build run is offered no old spell and no old upgrade, general ones included. Running out of picks after a few levels is fine.
- The simulation (`src/sim`, `src/data`) imports nothing from `src/render` or `src/ui`.
- Heat shows as **colour only**; nothing but Heavy Bolt makes a bolt bigger.
- Don't run `npm run build` (it rewrites `docs/`, the deployed site). Typecheck with `npx tsc --noEmit`.
- Commit locally after each task; never push (pushing `main` deploys).

## Review Focus

1. **Kindling when every enemy in range is burning or already targeted** → falls back to the nearest enemy, never no target. (Task 3)
2. **Split Shot with Fork and Return** → only the main bolt forks or returns; the extras never loop home. (Task 3)
3. **Accelerating Bolt with Return** → keeps speeding up on the way back, but never past 3× its speed. (Task 4)
4. **A new-build run that has taken every upgrade there is** → the "Level up" button disappears instead of sitting there doing nothing. (Task 1)
5. **Stoked coming back through a crowd with Return** → heat stops at +120%. (Task 4)

## Files

| File | Change |
|---|---|
| `src/data/types.ts` | `build?` on `WeaponDef` and `UpgradeDef` |
| `src/config.ts` | `spells.oldBuild`, `character.defaultStarter`, new `combat` numbers |
| `src/sim/spellTiers.ts` | `activeBuild()`; only the active build's spells |
| `src/sim/draft.ts` | old upgrades only for runs with an old spell; `hasOffers()` |
| `src/ui/draft.ts` | the level-up button hides when there's nothing to offer |
| `src/sim/world.ts` | explicit default starter |
| `src/data/weapons.ts` | `build: 'old'` on the old tiered spells; new `spell_firebolt_01` |
| `src/data/genericUpgrades.ts` | **new**: `boltUpgrades(spellId, prefix)` |
| `src/data/upgrades.ts` | `build: 'old'` on every existing upgrade; the new Firebolt's upgrades |
| `tests/spellTiers.test.ts`, `tests/firewall.test.ts` | run in the old build (they test the old roster) |
| `src/sim/targeting.ts` | `unburntEnemies` |
| `src/sim/behaviours.ts` | projectile cast: Kindling, Split Shot, white-hot, new mutations |
| `src/sim/projectiles.ts` | new bolt fields; Accelerating Bolt and Stoked in flight |
| `src/sim/upgradeInfo.ts` | tooltip labels for `split`, `stoked` |
| `src/render/effects.ts` | heat halos; Hot Streak glow reads `whiteHot` too |
| `tools/extract-art.ps1` | icon for `spell_firebolt_01` |
| `tests/newBuild.test.ts` | **new** |
| `tests/newFirebolt.test.ts` | **new** |

---

### Task 1: The build switch — everything old retired

**Files:**
- Modify: `src/data/types.ts` (WeaponDef, UpgradeDef), `src/config.ts` (`character`, `spells`), `src/sim/spellTiers.ts` (`spellsOfTier`), `src/sim/draft.ts` (`upgradeIsEligible`, new `hasOffers`), `src/ui/draft.ts` (`update`), `src/sim/world.ts:348-353` and its `spellsOfTier` import, `src/data/weapons.ts`, `src/data/upgrades.ts`, `tests/spellTiers.test.ts`, `tests/firewall.test.ts`
- Test: `tests/newBuild.test.ts`

**Interfaces:**
- Produces: `activeBuild(): 'old' | 'new'` (spellTiers.ts); `hasOffers(world: World): boolean` (draft.ts); `WeaponDef.build?: 'old' | 'new'`; `UpgradeDef.build?: 'old' | 'new'`; `config.spells.oldBuild: boolean`; `config.character.defaultStarter: string`.

- [ ] **Step 1: Write the failing test** — create `tests/newBuild.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- newBuild`
Expected: the type-check step fails (`build` doesn't exist on `WeaponDef`, `hasOffers` isn't exported, `oldBuild` doesn't exist on `config.spells`).

- [ ] **Step 3: Add the fields.** In `src/data/types.ts`, inside `WeaponDef` right after `tier?: number`:

```ts
  /**
   * Which build it belongs to: 'old' is everything made before the spellbook
   * redesign, retired; 'new' is the redesign. Left out, it belongs to both
   * (summon spells, shelved ones). `config.spells.oldBuild` picks which one
   * is offered; see spellsOfTier in sim/spellTiers.ts.
   */
  build?: 'old' | 'new'
```

and inside `UpgradeDef` right after `spellId?: string`:

```ts
  /**
   * Which build it's for, like WeaponDef.build. Set, it's only offered to a
   * run that owns a spell of that build: every upgrade made before the
   * redesign is 'old', so a new-build run never sees one.
   */
  build?: 'old' | 'new'
```

In `src/config.ts`, inside `character` after `startingWeaponIds`:

```ts
    /**
     * The spell a run starts with when nothing was picked: tests, benches, the
     * run behind the menu. Real runs always pass the player's pick.
     */
    defaultStarter: 'spell_bolt_01',
```

and inside `spells` after `tierLevels`:

```ts
    /**
     * Which roster the menu and the tier choices offer. false: the new build,
     * the spellbook redesign, and nothing else (a tier with no new spells yet
     * is skipped). true: the old build as it was. Spells he already has keep
     * working either way.
     */
    oldBuild: false,
```

- [ ] **Step 4: Offer only the active build.** In `src/sim/spellTiers.ts`, replace `spellsOfTier` with:

```ts
/** Which build the menu and the tier choices offer: see `config.spells.oldBuild`. */
export function activeBuild(): 'old' | 'new' {
  return config.spells.oldBuild ? 'old' : 'new'
}

/**
 * Every enabled spell of a tier for a class, in data order, for the build
 * being played. The other build's spells are left out; unmarked ones belong
 * to both.
 */
export function spellsOfTier(classDef: ClassDef, tier: number): WeaponDef[] {
  const other = activeBuild() === 'old' ? 'new' : 'old'
  return WEAPON_DEFS.filter((def) => def.enabled && def.tier === tier && def.classId === classDef.id && def.build !== other)
}
```

- [ ] **Step 5: Old upgrades for old runs only; an empty draft hides the button.** In `src/sim/draft.ts` `upgradeIsEligible`, add right after the `def.spellId` line:

```ts
  // Retired: an upgrade of one build only for a run that owns a spell of it.
  if (def.build && !world.weapons.some((weapon) => weapon.def.build === def.build)) return false
```

and add after `upgradeIsEligible`:

```ts
/**
 * Whether there's anything to offer right now. With nothing, a level can't be
 * spent, so the level-up button stays hidden rather than doing nothing.
 */
export function hasOffers(world: World): boolean {
  if (world.draftOffers && world.draftOffers.length > 0) return true
  return UPGRADE_DEFS.some((def) => upgradeIsEligible(world, def))
}
```

In `src/ui/draft.ts`, add `hasOffers` to the import from `'../sim/draft'`, and in `update()` change the `pending` line to:

```ts
    // Nothing to spend once he's dead, or while there's nothing to pick.
    const pending = world.state === 'running' && world.pendingLevelUps > 0 && hasOffers(world) ? world.pendingLevelUps : 0
```

(and delete the comment line above it that said only "Nothing to spend once he's dead...", since the new one replaces it).

- [ ] **Step 6: The default starter.** In `src/sim/world.ts` `startingSpells`, change the `starter` line to:

```ts
  const starter = starterId ?? config.character.defaultStarter
```

and delete the now-unused `import { spellsOfTier } from './spellTiers'` (the project has `noUnusedLocals`).

- [ ] **Step 7: Retire the old build.** In `src/data/weapons.ts` add `build: 'old',` on the line after `tier: N,` for exactly these ten: `spell_bolt_01`, `spell_frostbolt_01`, `spell_chain_01`, `spell_aura_01`, `spell_orb_01`, `spell_ball_01`, `spell_meteor_01`, `spell_wall_01`, `spell_blizzard_01`, `spell_storm_01`. Add this paragraph to the file's top comment, after the "To take a spell out of the game" one:

```ts
 * Every spell above the new-build section is the old build (`build: 'old'`),
 * retired: made before the spellbook redesign and no longer offered unless
 * config.spells.oldBuild is on. Kept so the old build can still be played
 * and its tests keep proving the systems underneath.
```

Mark every existing upgrade in `src/data/upgrades.ts` (all of them: offence, defence, utility, Firebolt, Righteous Fire, Firewall, elements). Every entry's `id:` line is indented four spaces, so one command does it:

```bash
node -e "const fs=require('fs');const f='src/data/upgrades.ts';const s=fs.readFileSync(f,'utf8').replace(/^(    id: '[^']+',)$/gm, \"\$1\n    build: 'old',\");fs.writeFileSync(f,s)"
```

Check it: `grep -c "^    id: '" src/data/upgrades.ts` and `grep -c "^    build: 'old'," src/data/upgrades.ts` print the same number. Then add to the file's top comment:

```ts
 * Every entry below is the old build (`build: 'old'`), retired: offered only
 * to a run that owns an old spell. The new build's upgrades are marked by
 * their spellId instead (and its general ones will get `build: 'new'`).
```

- [ ] **Step 8: Tests of the old roster run in the old build.** `tests/spellTiers.test.ts` and `tests/firewall.test.ts` check the old tier lists. Add near the top of each, after the imports (add `import { config } from '@game/config'` if it's not already imported):

```ts
// The old roster: retired, but still what this test is about.
config.spells.oldBuild = true
```

- [ ] **Step 9: Run the new test, then everything**

Run: `npm test -- newBuild` → Expected: `ALL PASS`.
Run: `npm test` → Expected: every file passes. If another file fails because it reads the tier lists through `spellsOfTier`, give it the same two lines as Step 8. Don't change game code to make an old test pass.

- [ ] **Step 10: Commit**

```bash
git add src/data/types.ts src/config.ts src/sim/spellTiers.ts src/sim/draft.ts src/ui/draft.ts src/sim/world.ts src/data/weapons.ts src/data/upgrades.ts tests/newBuild.test.ts tests/spellTiers.test.ts tests/firewall.test.ts
git commit -m "Retire the old build: every spell and upgrade, behind a switch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The new Firebolt, and the generic bolt list

**Files:**
- Modify: `src/data/weapons.ts` (new section before `// --- Summon spells`), `src/data/upgrades.ts` (import, new section before `// --- Firebolt`)
- Create: `src/data/genericUpgrades.ts`
- Test: `tests/newFirebolt.test.ts`

**Interfaces:**
- Consumes: `build` field (Task 1).
- Produces: spell `spell_firebolt_01`; `boltUpgrades(spellId: string, prefix: string): UpgradeDef[]`; upgrade ids `up_firebolt_pierce`, `up_firebolt_fork`, `up_firebolt_return`.

- [ ] **Step 1: Write the failing test** — create `tests/newFirebolt.test.ts`:

```ts
// The new build's Firebolt (spellbook, Version 12): its generic bolt upgrades
// and its mutations, through the real simulation.
import { ENEMY_DEFS } from '@game/data/enemies'
import { UPGRADE_DEFS } from '@game/data/upgrades'
import { updateCombat } from '@game/sim/combat'
import { applyUpgrade, upgradeIsEligible } from '@game/sim/draft'
import { rebuildEnemyGrid } from '@game/sim/enemyGrid'
import { createWorld, type Enemy, type World } from '@game/sim/world'

const FIREBOLT = 'spell_firebolt_01'
const DT = 1 / 60
let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
  if (!ok) failures++
}
const up = (id: string) => {
  const def = UPGRADE_DEFS.find((entry) => entry.id === id)
  if (!def) throw new Error(`No upgrade "${id}"`)
  return def
}
const take = (world: World, id: string, times = 1) => {
  for (let i = 0; i < times; i++) applyUpgrade(world, up(id))
}
const eligible = (world: World, id: string) => upgradeIsEligible(world, up(id))
let nextId = 1
function enemy(world: World, x: number, y: number, hp = 1e9): Enemy {
  const e: Enemy = { id: nextId++, def: ENEMY_DEFS[0], x, y, hp, maxHp: hp, speed: 0, effects: [], stride: 0 }
  world.enemies.push(e)
  return e
}
const lost = (e: Enemy) => e.maxHp - e.hp
/** A run with the new Firebolt; he stands at the origin and nothing moves him. */
const fireWorld = () => createWorld(1, FIREBOLT)
/** One cast right now, then no more casting. */
function cast(world: World): void {
  world.weapons[0].cooldownRemaining = 0
  rebuildEnemyGrid(world)
  updateCombat(world, DT)
  world.weapons[0].cooldownRemaining = 99
}
/** Let everything fly for a while. */
function fly(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.time += DT
    rebuildEnemyGrid(world)
    updateCombat(world, DT)
  }
}

// --- The spell and its generic bolt upgrades ----------------------------------

{
  const w = fireWorld()
  const oldRun = createWorld(1, 'spell_bolt_01')
  check('Pierce, Fork, Return offered with the new Firebolt', ['pierce', 'fork', 'return'].every((k) => eligible(w, `up_firebolt_${k}`)))
  check('...never with the old one', ['pierce', 'fork', 'return'].every((k) => !eligible(oldRun, `up_firebolt_${k}`)))
  check("...and the old Firebolt's never with the new one", !eligible(w, 'up_fb_ignite') && !eligible(w, 'up_fb_pierce'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce', 2)
  const line = [90, 120, 150, 180].map((x) => enemy(w, x, 0))
  cast(w)
  fly(w, 1)
  const hit = line.filter((e) => lost(e) > 0).length
  check('Pierce x2: through two, stopped by the third', hit === 3, `${hit} of 4 hit`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_fork')
  enemy(w, 90, 0)
  enemy(w, 130, 60)
  cast(w)
  let forks: typeof w.projectiles = []
  for (let i = 0; i < 60 && forks.length === 0; i++) {
    fly(w, DT)
    forks = w.projectiles.filter((p) => !p.mutations)
  }
  check('Fork: a hit throws one plain bolt', forks.length === 1 && forks[0].pierce === 0, `${forks.length} plain bolt(s)`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_return')
  enemy(w, 150, 0)
  cast(w)
  let turned = false
  for (let i = 0; i < 150; i++) {
    fly(w, DT)
    if (w.projectiles.some((p) => p.returning)) turned = true
  }
  check('Return: it comes back to him', turned && w.projectiles.length === 0)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
```

(Later tasks add imports and helpers at the top and insert their blocks **above** the final two `console.log`/`exitCode` lines. The tests' tsconfig extends the game's, which has `noUnusedLocals`, so each task imports only what its own blocks use.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- newFirebolt`
Expected: it throws `No upgrade "up_firebolt_pierce"` (or `No weapon definition with id "spell_firebolt_01"`).

- [ ] **Step 3: The spell.** In `src/data/weapons.ts`, insert before `// --- Summon spells`:

```ts
  // --- New build: the spellbook redesign -------------------------------------------
  //
  // Each takes over its tier and element from the old spell as it's built (see
  // spellsOfTier). Upgrades and design: the spellbook. Numbers start as the old
  // spell's and wait for balance day.

  {
    id: 'spell_firebolt_01',
    classId: 'class_wizard',
    displayName: 'Firebolt',
    description: 'A bolt of fire at the nearest enemy',
    enabled: true,
    tier: 1,
    build: 'new',
    tags: ['spell', 'fire', 'projectile', 'bolt'],
    behaviour: 'projectile',
    stats: {
      cooldown: 0.95,
      damage: 9,
      count: 1,
      speed: 360,
      pierce: 0,
      range: 520,
      spread: 0.14,
    },
    fx: { hit: 'hit_fire' },
    colour: '#ff8a3d',
  },
```

- [ ] **Step 4: The generic bolt list.** Create `src/data/genericUpgrades.ts`:

```ts
import type { UpgradeDef } from './types'

/**
 * Upgrade lists shared by every spell of one shape — bolts now, beams and
 * chains later — from the spellbook's "Generic upgrade ideas".
 *
 * Each spell gets its own copies, with its own spellId and ids, so a pick for
 * one spell never reaches another: two bolt spells each have their own
 * Pierce. `prefix` makes the ids: boltUpgrades('spell_firebolt_01',
 * 'up_firebolt') gives up_firebolt_pierce, up_firebolt_fork, and so on.
 */
export function boltUpgrades(spellId: string, prefix: string): UpgradeDef[] {
  return [
    {
      id: `${prefix}_pierce`,
      spellId,
      displayName: 'Pierce',
      description: 'Passes through 1 more enemy',
      details: 'The bolt passes through an enemy instead of stopping, and can hit another one behind it.',
      tags: ['offence'],
      modifiers: [{ target: 'pierce', op: 'add', value: 1 }],
      grantsTags: ['piercing'],
      maxStacks: 3,
      weight: 55,
    },
    {
      id: `${prefix}_fork`,
      spellId,
      displayName: 'Fork',
      description: 'Hits throw a small bolt at another enemy',
      details: 'After its first hit, the bolt throws a smaller bolt at another enemy nearby.',
      tags: ['offence'],
      // Forks are plain bolts at half the hit's damage (combat.forkDamage).
      modifiers: [{ target: 'fork', op: 'add', value: 1 }],
      maxStacks: 3,
      weight: 55,
    },
    {
      id: `${prefix}_return`,
      spellId,
      displayName: 'Return',
      description: 'The bolt comes back to him',
      details: 'At the end of its flight, or when an enemy stops it, the bolt turns around and flies back to him, through everything on the way.',
      tags: ['offence'],
      modifiers: [{ target: 'returns', op: 'add', value: 1 }],
      maxStacks: 1,
      weight: 45,
    },
  ]
}
```

- [ ] **Step 5: Offer them.** In `src/data/upgrades.ts` add `import { boltUpgrades } from './genericUpgrades'` under the existing import. Then insert before `// --- Firebolt ---`:

```ts
  // --- Firebolt (new build) -------------------------------------------------------
  //
  // spell_firebolt_01: the generic bolt list, then its own mutations. The old
  // Firebolt's section below stays for the old build.

  ...boltUpgrades('spell_firebolt_01', 'up_firebolt'),
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- newFirebolt` → Expected: `ALL PASS`.
Run: `npm test` → Expected: all files pass. The new build's tier 1 is now just the new Firebolt; `spellTiers.test.ts` runs in the old build since Task 1, so it isn't affected.

- [ ] **Step 7: Commit**

```bash
git add src/data/weapons.ts src/data/genericUpgrades.ts src/data/upgrades.ts tests/newFirebolt.test.ts
git commit -m "New build: Firebolt, with the generic bolt upgrades" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Casting — Ignite, Kindling, Split Shot, Hot Streak

**Files:**
- Modify: `src/sim/projectiles.ts` (`BoltMutations`, `Projectile`), `src/sim/targeting.ts` (new function), `src/sim/behaviours.ts:62-156` (the `projectile` behaviour), `src/config.ts` (`combat`), `src/data/genericUpgrades.ts` (Split Shot), `src/data/upgrades.ts` (new Firebolt mutations)
- Test: `tests/newFirebolt.test.ts`

**Interfaces:**
- Consumes: `spell_firebolt_01`, `boltUpgrades` (Task 2).
- Produces: `BoltMutations.accelerate: boolean`, `BoltMutations.stoked: number`; `Projectile.targetId?`, `baseDamage?`, `baseSpeed?`, `whiteHot?`, `flown?`, `heat?`; `unburntEnemies(world, x, y, range, count, taken: Set<number>, out: Enemy[]): Enemy[]`; spell stats `kindling`, `split`, `whiteHot`, `accelerate`, `stoked`; `config.combat.whiteHotDamage`, `accelerateStart`, `accelerateEnd`, `accelerateMax`, `accelerateDamageLead`, `stokedMax`; upgrade ids `up_firebolt_split`, `up_firebolt_ignite`, `up_firebolt_kindling`, `up_firebolt_hotstreak`, `up_firebolt_stoked`, `up_firebolt_backdraft`.

- [ ] **Step 1: Write the failing tests.** In `tests/newFirebolt.test.ts`, add these imports at the top:

```ts
import { config } from '@game/config'
import { weaponStat } from '@game/sim/stats'
import { applyCondition, hasCondition } from '@game/sim/statusEffects'
```

these two helpers after `fly`:

```ts
const near = (a: number, b: number, slack = 1e-6) => Math.abs(a - b) <= slack
const damageOf = (world: World) => weaponStat(world, world.weapons[0], 'damage')
```

and these blocks above the final `console.log`:

```ts
// --- Ignite ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce')
  take(w, 'up_firebolt_ignite')
  const a = enemy(w, 90, 0)
  const b = enemy(w, 120, 0)
  cast(w)
  fly(w, 1)
  check('Ignite: sets what it hits burning, pierced ones too', hasCondition(a, 'burning') && hasCondition(b, 'burning'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_fork')
  take(w, 'up_firebolt_ignite')
  enemy(w, 90, 0)
  const side = enemy(w, 130, 60)
  cast(w)
  fly(w, 1)
  check("...but its plain fork doesn't", lost(side) > 0 && !hasCondition(side, 'burning'), `fork dealt ${lost(side).toFixed(1)}`)
}

// --- Kindling ----------------------------------------------------------------

{
  const w = fireWorld()
  check('Kindling needs Ignite first', !eligible(w, 'up_firebolt_kindling'))
  take(w, 'up_firebolt_ignite')
  check('...offered once Ignite is in', eligible(w, 'up_firebolt_kindling'))
  take(w, 'up_firebolt_kindling')
  const nearBurning = enemy(w, 80, 0)
  const far = enemy(w, 0, 160)
  applyCondition(w, nearBurning, 'burning', 1, 5, null)
  cast(w)
  check('...aims past a burning enemy at an unburnt one', w.projectiles[0]?.targetId === far.id)
  cast(w)
  check('...all burning or taken: the nearest as usual', w.projectiles[1]?.targetId === nearBurning.id)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_ignite')
  take(w, 'up_firebolt_kindling')
  const a = enemy(w, 100, 0)
  const b = enemy(w, 0, 130)
  cast(w)
  cast(w)
  const targets = w.projectiles.map((p) => p.targetId)
  check('...two casts in a row spread to two enemies', targets.includes(a.id) && targets.includes(b.id), JSON.stringify(targets))
}

// --- Split Shot ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_split', 2)
  take(w, 'up_firebolt_fork')
  take(w, 'up_firebolt_return')
  take(w, 'up_firebolt_ignite')
  enemy(w, 100, 0)
  enemy(w, 100, 60)
  enemy(w, 100, -60)
  cast(w)
  const bolts = w.projectiles
  check('Split Shot x2: three bolts', bolts.length === 3, `${bolts.length}`)
  check('...sharing the damage, a third each', bolts.every((b) => near(b.damage, damageOf(w) / 3)))
  check('...each at its own enemy', new Set(bolts.map((b) => b.targetId)).size === 3)
  check('...every one carries Ignite', bolts.every((b) => (b.mutations?.ignite ?? 0) > 0))
  check('...only the main bolt forks and returns', bolts.filter((b) => (b.mutations?.fork ?? 0) > 0 || (b.mutations?.returns ?? 0) > 0).length === 1)
  check('...and it stops at three bolts', !eligible(w, 'up_firebolt_split'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_split', 2)
  enemy(w, 100, 0)
  cast(w)
  const angles = new Set(w.projectiles.map((b) => Math.atan2(b.vy, b.vx).toFixed(3)))
  check('...one enemy: the extras fan out either side', angles.size === 3)
}

// --- Hot Streak ----------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_hotstreak')
  enemy(w, 400, 0)
  const casts: { damage: number; radius: number; white: boolean }[] = []
  for (let n = 0; n < 5; n++) {
    w.projectiles.length = 0
    cast(w)
    const b = w.projectiles[0]
    casts.push({ damage: b.damage, radius: b.radius, white: b.whiteHot === true })
  }
  check('Hot Streak: the 5th cast is white-hot', casts.map((c) => c.white).join() === 'false,false,false,false,true')
  check('...at twice the damage', near(casts[4].damage, casts[0].damage * config.combat.whiteHotDamage))
  check('...and the same size', casts[4].radius === casts[0].radius)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_hotstreak')
  take(w, 'up_firebolt_split', 2)
  enemy(w, 400, 0)
  for (let n = 0; n < 5; n++) {
    w.projectiles.length = 0
    cast(w)
  }
  check('...every bolt of that cast, Split Shot too', w.projectiles.length === 3 && w.projectiles.every((b) => b.whiteHot === true))
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- newFirebolt`
Expected: throws `No upgrade "up_firebolt_ignite"`.

- [ ] **Step 3: The numbers.** In `src/config.ts` `combat`, after `backdraftCooldown: 4,`:

```ts
    /** Hot Streak (new build): every bolt of the white-hot cast hits this many times harder. Colour only; no growth. */
    whiteHotDamage: 2,
    /**
     * Accelerating Bolt: speed at the start and at the end of its outward
     * flight, as a share of its speed; it keeps rising on the way back, up to
     * accelerateMax. Its damage multiplier is its speed multiplier plus
     * accelerateDamageLead: 0.7x at the start, 2.2x at the end.
     */
    accelerateStart: 0.5,
    accelerateEnd: 2,
    accelerateMax: 3,
    accelerateDamageLead: 0.2,
    /** Stoked: the most extra damage heat can add, as a share (1.2 = +120%). */
    stokedMax: 1.2,
```

- [ ] **Step 4: Bolt fields.** In `src/sim/projectiles.ts`, add to `BoltMutations` after `trail: number`:

```ts
  /** Accelerating Bolt: speeds up over its flight, hitting harder as it does. */
  accelerate: boolean
  /** Stoked: extra damage for each enemy it has passed through, as a share (0.15 = +15%). */
  stoked: number
```

and to `Projectile` after `kilnBurn?: WeaponInstance`:

```ts
  /** The enemy it was aimed at, for Kindling to look past. */
  targetId?: number
  /** Its damage before Accelerating Bolt and Stoked, which recompute `damage` from it. */
  baseDamage?: number
  /** Its speed before Accelerating Bolt. */
  baseSpeed?: number
  /** Hot Streak (new build): the white-hot cast. Drawn white. */
  whiteHot?: boolean
  /** Seconds in the air, for Accelerating Bolt. */
  flown?: number
  /** Enemies passed through, for Stoked. */
  heat?: number
```

- [ ] **Step 5: Kindling's targeting.** In `src/sim/targeting.ts`, after `nearestEnemies` (it reads `effects` directly rather than importing `hasCondition`, which would make a circular import through statusEffects → damageEnemy → walls → targeting):

```ts
/**
 * Kindling: up to `count` enemies within range, unburnt ones that no bolt is
 * already flying at (`taken`) first, nearest first within each group. When
 * everything is burning or taken, that's simply the nearest.
 */
export function unburntEnemies(world: World, x: number, y: number, maxRange: number, count: number, taken: Set<number>, out: Enemy[]): Enemy[] {
  enemiesInRadius(world, x, y, maxRange, out)
  const burning = (enemy: Enemy) => enemy.effects.some((effect) => effect.condition === 'burning')
  const fresh = (enemy: Enemy) => (!taken.has(enemy.id) && !burning(enemy) ? 0 : 1)
  out.sort((a, b) => fresh(a) - fresh(b) || (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
  if (out.length > count) out.length = count
  return out
}
```

- [ ] **Step 6: The cast.** In `src/sim/behaviours.ts`, change the targeting import to `import { enemiesInRadius, nearestEnemies, nearestEnemy, pickTargets, unburntEnemies } from './targeting'`, then replace the whole `projectile` behaviour (the `const projectile: Behaviour = ...` through its closing `}`) with:

```ts
const projectile: Behaviour = ({ world, weapon, caster, def, stat }) => {
  const range = stat('range')
  const count = Math.max(1, Math.round(stat('count')))
  // Split Shot: each bolt becomes 1 + split bolts, sharing its damage.
  const split = Math.max(0, Math.round(stat('split')))
  const volley = count * (1 + split)

  // His side aims at the nearest enemies (with Kindling, the nearest unburnt
  // ones); the enemies' side aims at him.
  const foe = caster.side === 'enemy'
  const targets: readonly { x: number; y: number; id?: number }[] = foe
    ? aimAtHim(world, caster, range)
    : stat('kindling') > 0
      ? unburntEnemies(world, caster.x, caster.y, range, volley, takenBy(world, weapon), scratchTargets)
      : nearestEnemies(world, caster.x, caster.y, range, volley, scratchTargets)
  if (targets.length === 0) return false

  // Evolutions reshape the bolt through these three, not through its damage
  // and speed themselves, so the plain bolts it forks into stay plain.
  const speed = stat('speed') * stat('boltSpeed', 1)
  const spread = stat('spread')
  const damage = stat('damage') * stat('boltDamage', 1)
  const pierce = Math.max(0, Math.round(stat('pierce')))
  const size = (stat('size') || config.combat.projectileRadius) * stat('boltSize', 1)

  // What upgrades have made the bolts do. Undefined — a plain bolt — when none.
  const mutations: BoltMutations = {
    fork: Math.max(0, Math.round(stat('fork'))),
    forkEveryHit: false,
    returns: Math.max(0, Math.round(stat('returns'))),
    explode: Math.max(0, stat('explode')),
    ignite: Math.max(0, stat('ignite')),
    combust: stat('combustion') > 0,
    trail: Math.max(0, stat('flameTrail')),
    accelerate: stat('accelerate') > 0,
    stoked: Math.max(0, stat('stoked')),
  }
  const mutated =
    mutations.fork > 0 || mutations.returns > 0 || mutations.explode > 0 || mutations.ignite > 0 || mutations.combust || mutations.trail > 0 || mutations.accelerate || mutations.stoked > 0

  // Hot Streak (old build): every Nth cast, the first bolt is an empowered one.
  const streakEvery = Math.round(stat('hotStreak'))
  let empowered = false
  if (streakEvery > 0) {
    weapon.streak = (weapon.streak ?? 0) + 1
    if (weapon.streak >= streakEvery) {
      weapon.streak = 0
      empowered = true
    }
  }
  // Hot Streak (new build): every Nth cast is white-hot, every bolt of it.
  const whiteEvery = Math.round(stat('whiteHot'))
  let white = false
  if (whiteEvery > 0) {
    weapon.streak = (weapon.streak ?? 0) + 1
    if (weapon.streak >= whiteEvery) {
      weapon.streak = 0
      white = true
    }
  }

  // Whatever lingers on a hit: a chill if the spell slows, its damage over
  // time if it has some. Neither for a plain bolt.
  const duration = stat('duration')
  const slow = stat('slow')
  const burn = stat('dotDamage')
  const onHit =
    duration <= 0
      ? null
      : slow > 0
        ? { condition: 'chilled', magnitude: slow, duration }
        : burn > 0
          ? { condition: def.dotCondition ?? 'burning', magnitude: burn, duration }
          : null

  // Accelerating Bolt goes from accelerateStart to accelerateEnd of its speed,
  // so it averages their middle: its flight lasts long enough to cover its range.
  const { accelerateStart, accelerateEnd } = config.combat
  const cruise = mutations.accelerate ? speed * ((accelerateStart + accelerateEnd) / 2) : speed
  const launch = mutations.accelerate ? speed * accelerateStart : speed
  const shared = (damage / (1 + split)) * (white ? config.combat.whiteHotDamage : 1)

  for (let i = 0; i < volley; i++) {
    const target = targets[i % targets.length]
    // Bolts beyond the number of targets go round again, fanned out either
    // side of the line: +spread, -spread, +2 spread...
    const round = Math.floor(i / targets.length)
    const offset = round === 0 ? 0 : Math.ceil(round / 2) * spread * (round % 2 === 1 ? 1 : -1)
    const angle = Math.atan2(target.y - caster.y, target.x - caster.x) + offset

    // The empowered bolt (old build) pierces everything, forks off every enemy
    // it goes through, hits harder, is bigger and flies further.
    const hot = empowered && i === 0
    const reach = hot ? config.combat.hotStreakRange : range
    const life = cruise > 0 ? reach / cruise : 0
    const boltPierce = hot ? 999 : pierce
    // The first `count` bolts are the main ones: Split Shot's extras leave
    // forking and returning to them.
    const main = i < count
    const hit = hot ? shared * config.combat.hotStreakDamage : shared
    world.projectiles.push({
      x: caster.x,
      y: caster.y,
      vx: Math.cos(angle) * launch,
      vy: Math.sin(angle) * launch,
      damage: hit,
      baseDamage: hit,
      baseSpeed: speed,
      pierce: boltPierce,
      // A spell can set its own bolt size — Frozen Orb is a big slow ball.
      radius: hot ? size * config.combat.hotStreakSize : size,
      colour: def.colour,
      tags: def.tags,
      life,
      hits: new Set(),
      source: weapon,
      // He has no conditions for a chill to go on.
      onHit: foe ? null : onHit,
      side: foe ? 'enemy' : undefined,
      mutations:
        mutated || hot
          ? { ...mutations, fork: hot ? Math.max(1, mutations.fork) : main ? mutations.fork : 0, returns: main ? mutations.returns : 0, forkEveryHit: hot }
          : undefined,
      empowered: hot,
      whiteHot: white || undefined,
      targetId: foe ? undefined : target.id,
      outLife: life,
    })
  }

  return true
}

const takenScratch = new Set<number>()

/** Enemies a bolt of this spell is already flying at: Kindling looks past them. */
function takenBy(world: World, weapon: WeaponInstance): Set<number> {
  takenScratch.clear()
  for (const bolt of world.projectiles) {
    if (bolt.source === weapon && bolt.targetId !== undefined && !bolt.returning) takenScratch.add(bolt.targetId)
  }
  return takenScratch
}
```

(For the old spells nothing changes: `split` is 0, so `volley === count` and `shared === damage`; `accelerate`, `stoked`, `kindling` and `whiteHot` are 0.)

- [ ] **Step 7: Split Shot.** In `src/data/genericUpgrades.ts`, add as the last entry of the returned array:

```ts
    {
      id: `${prefix}_split`,
      spellId,
      displayName: 'Split Shot',
      description: 'More bolts, sharing the damage',
      details: 'Fires more bolts at once, fanned out, sharing the damage between them. Only the main bolt returns and forks.',
      tags: ['offence'],
      // +1 bolt a pick, up to 3 bolts: each hits for a third.
      modifiers: [{ target: 'split', op: 'add', value: 1 }],
      maxStacks: 2,
      weight: 50,
    },
```

- [ ] **Step 8: The mutations.** In `src/data/upgrades.ts`, right after `...boltUpgrades('spell_firebolt_01', 'up_firebolt'),`:

```ts
  {
    id: 'up_firebolt_ignite',
    spellId: 'spell_firebolt_01',
    kind: 'mutation',
    displayName: 'Ignite',
    description: 'Hits set the target burning',
    details: "Every enemy the bolt hits starts burning for a few seconds. Enemies it pierces and hits on its way back count too; the small forked bolts don't.",
    tags: ['offence', 'fire'],
    // 40% of each hit again as burning over combat.igniteSeconds; refreshes, never stacks.
    modifiers: [{ target: 'ignite', op: 'add', value: 0.4 }],
    grantsTags: ['burning'],
    maxStacks: 1,
    weight: 60,
  },
  {
    id: 'up_firebolt_kindling',
    spellId: 'spell_firebolt_01',
    kind: 'mutation',
    displayName: 'Kindling',
    description: "Aims at enemies that aren't burning yet",
    details: "Firebolt aims at the nearest enemy that isn't burning yet, so its burns spread through the crowd instead of piling onto one target.",
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'kindling', op: 'add', value: 1 }],
    requires: ['up_firebolt_ignite'],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_firebolt_hotstreak',
    spellId: 'spell_firebolt_01',
    kind: 'mutation',
    displayName: 'Hot Streak',
    description: 'Every 5th cast is white-hot and hits harder',
    details: 'Every fifth cast comes out white-hot and hits much harder. It flies and looks like any other bolt, just hotter.',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'whiteHot', op: 'add', value: 5 }],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_firebolt_stoked',
    spellId: 'spell_firebolt_01',
    kind: 'mutation',
    displayName: 'Stoked',
    description: 'Burning through enemies makes it hotter',
    details: 'Each enemy the bolt passes through makes it hotter and harder-hitting for the rest of its flight. It glows deeper red as it heats up, but never gets bigger.',
    tags: ['offence', 'fire'],
    // +15% per enemy passed through, up to combat.stokedMax.
    modifiers: [{ target: 'stoked', op: 'add', value: 0.15 }],
    requires: ['up_firebolt_pierce'],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_firebolt_backdraft',
    spellId: 'spell_firebolt_01',
    kind: 'mutation',
    displayName: 'Backdraft',
    description: "When he's hit, bolts burst out of him",
    details: 'When an enemy hits him, a ring of small firebolts bursts out of him in every direction. It needs a few seconds before it can happen again.',
    // The comfort pick: plain bolts, combat.backdraftCooldown between rings.
    tags: ['defence', 'fire'],
    modifiers: [{ target: 'backdraft', op: 'add', value: 8 }],
    maxStacks: 1,
    weight: 45,
  },
```

- [ ] **Step 9: Run the tests**

Run: `npm test -- newFirebolt` → Expected: `ALL PASS` (Stoked has data but no effect yet; nothing tests it until Task 4).
Run: `npm test` → Expected: every file passes. The old Firebolt tests must pass untouched, since they're the proof that the old behaviour didn't change.

- [ ] **Step 10: Commit**

```bash
git add src/config.ts src/sim/projectiles.ts src/sim/targeting.ts src/sim/behaviours.ts src/data/genericUpgrades.ts src/data/upgrades.ts tests/newFirebolt.test.ts
git commit -m "New Firebolt: Ignite, Kindling, Split Shot, Hot Streak" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: In flight — Heavy and Accelerating Bolt, Stoked

**Files:**
- Modify: `src/data/genericUpgrades.ts` (the pair), `src/sim/projectiles.ts` (`hit`, `updateProjectiles`, two helpers)
- Test: `tests/newFirebolt.test.ts`

**Interfaces:**
- Consumes: `BoltMutations.accelerate`, `BoltMutations.stoked`, `Projectile.baseDamage`, `baseSpeed`, `flown`, `heat`, the `accelerate*` and `stokedMax` config (Task 3).
- Produces: upgrade ids `up_firebolt_heavy`, `up_firebolt_accelerating` (an either-or pair).

- [ ] **Step 1: Write the failing tests** — insert above the final `console.log`:

```ts
// --- Heavy or Accelerating ------------------------------------------------------------

{
  const w = fireWorld()
  check('Heavy and Accelerating are an either-or pair', up('up_firebolt_heavy').pairedWith === 'up_firebolt_accelerating')
  take(w, 'up_firebolt_heavy')
  const s = w.weapons[0]
  check('Heavy: 40% slower, 50% bigger, 1.6x damage', near(weaponStat(w, s, 'boltSpeed', 1), 0.6) && near(weaponStat(w, s, 'boltSize', 1), 1.5) && near(weaponStat(w, s, 'boltDamage', 1), 1.6))
  check('...and rules out Accelerating', !eligible(w, 'up_firebolt_accelerating'))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_accelerating')
  enemy(w, 515, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const base = weaponStat(w, w.weapons[0], 'speed')
  const start = Math.hypot(bolt.vx, bolt.vy)
  fly(w, (bolt.outLife ?? 1) * 0.85)
  const late = Math.hypot(bolt.vx, bolt.vy)
  // Measured after the cast's own step, so it has already sped up a touch.
  check('Accelerating: starts at half speed', near(start, base * 0.5, base * 0.05), `${start.toFixed(0)} of ${base}`)
  check('...and is nearly twice as fast late on', late > base * 1.6, `${late.toFixed(0)}`)
}
{
  const hitAt = (x: number) => {
    const w = fireWorld()
    take(w, 'up_firebolt_accelerating')
    const e = enemy(w, x, 0)
    cast(w)
    fly(w, 3)
    return lost(e)
  }
  const close = hitAt(40)
  const far = hitAt(480)
  check('...and hits harder the faster it goes', far > close * 1.8, `close ${close.toFixed(1)}, far ${far.toFixed(1)}`)
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_accelerating')
  take(w, 'up_firebolt_return')
  enemy(w, 500, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const base = weaponStat(w, w.weapons[0], 'speed')
  let fastest = 0
  for (let i = 0; i < 400 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    fastest = Math.max(fastest, Math.hypot(bolt.vx, bolt.vy))
  }
  check('With Return: faster still, never past 3x', fastest > base * 2 && fastest <= base * config.combat.accelerateMax + 1e-6, `${(fastest / base).toFixed(2)}x`)
}

// --- Stoked ------------------------------------------------------------------------

{
  const w = fireWorld()
  check('Stoked needs Pierce first', !eligible(w, 'up_firebolt_stoked'))
  take(w, 'up_firebolt_pierce', 3)
  check('...offered once Pierce is in', eligible(w, 'up_firebolt_stoked'))
  take(w, 'up_firebolt_stoked')
  const line = [80, 110, 140, 170].map((x) => enemy(w, x, 0))
  cast(w)
  fly(w, 1)
  const expected = [1, 1.15, 1.3, 1.45].map((k) => damageOf(w) * k)
  check('Stoked: +15% for each enemy burned through', line.every((e, i) => near(lost(e), expected[i], 0.01)), line.map((e) => lost(e).toFixed(2)).join(', '))
}
{
  const w = fireWorld()
  take(w, 'up_firebolt_pierce', 3)
  take(w, 'up_firebolt_stoked')
  take(w, 'up_firebolt_return')
  for (let k = 0; k < 12; k++) enemy(w, 60 + k * 25, 0)
  cast(w)
  const bolt = w.projectiles[0]
  let hottest = 0
  for (let i = 0; i < 200 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    hottest = Math.max(hottest, bolt.damage)
  }
  check('...never past +120%, even back through a crowd', near(hottest, damageOf(w) * (1 + config.combat.stokedMax), 0.01), `${(hottest / damageOf(w)).toFixed(2)}x`)
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- newFirebolt`
Expected: throws `No upgrade "up_firebolt_heavy"`.

- [ ] **Step 3: The pair.** In `src/data/genericUpgrades.ts`, insert these two entries between `_return` and `_split` (either-or pairs are dealt side by side in data order):

```ts
    {
      id: `${prefix}_heavy`,
      spellId,
      displayName: 'Heavy Bolt',
      description: 'Bigger and slower, hits harder',
      details: 'The bolt is bigger and slower, and hits harder.',
      tags: ['offence'],
      modifiers: [
        { target: 'boltSpeed', op: 'multiply', value: 0.6 },
        { target: 'boltSize', op: 'multiply', value: 1.5 },
        { target: 'boltDamage', op: 'multiply', value: 1.6 },
      ],
      pairedWith: `${prefix}_accelerating`,
      maxStacks: 1,
      weight: 45,
    },
    {
      id: `${prefix}_accelerating`,
      spellId,
      displayName: 'Accelerating Bolt',
      description: 'Speeds up, and hits harder as it does',
      details: 'The bolt starts slow and speeds up as it flies. The faster it goes, the harder it hits.',
      tags: ['offence'],
      // Half speed to twice by the end of its flight; damage follows (combat.accelerate*).
      modifiers: [{ target: 'accelerate', op: 'add', value: 1 }],
      maxStacks: 1,
      weight: 45,
    },
```

- [ ] **Step 4: The flight.** In `src/sim/projectiles.ts`, add before `function hit(`:

```ts
/**
 * Accelerating Bolt: how fast it's going now, as a share of its speed. From
 * accelerateStart at launch to accelerateEnd at the end of its outward flight,
 * still rising on the way back, never past accelerateMax.
 */
function accelerationFactor(projectile: Projectile): number {
  const { accelerateStart, accelerateEnd, accelerateMax } = config.combat
  const t = (projectile.flown ?? 0) / Math.max(1e-6, projectile.outLife ?? 1)
  return Math.min(accelerateMax, accelerateStart + (accelerateEnd - accelerateStart) * t)
}

/** What it hits for right now: its base, times Accelerating Bolt's speed and Stoked's heat. */
function boltDamageNow(projectile: Projectile): number {
  const mutations = projectile.mutations
  let damage = projectile.baseDamage ?? projectile.damage
  if (mutations?.accelerate) damage *= accelerationFactor(projectile) + config.combat.accelerateDamageLead
  if (mutations && mutations.stoked > 0) damage *= 1 + Math.min(config.combat.stokedMax, (projectile.heat ?? 0) * mutations.stoked)
  return damage
}
```

At the very end of `hit()`, after the `if (mutations) { ... }` block, add:

```ts
  // Stoked: every enemy it passes through heats it for the rest of its flight.
  if (mutations && mutations.stoked > 0) {
    projectile.heat = (projectile.heat ?? 0) + 1
    projectile.damage = boltDamageNow(projectile)
  }
```

In `updateProjectiles`, right after the `if (projectile.returning) { ... }` block and before `const fromX = projectile.x`, add:

```ts
    // Accelerating Bolt: its speed follows its time in the air, its damage its speed.
    if (mutations?.accelerate && projectile.baseSpeed) {
      projectile.flown = (projectile.flown ?? 0) + dt
      const current = Math.hypot(projectile.vx, projectile.vy) || 1
      const wanted = projectile.baseSpeed * accelerationFactor(projectile)
      projectile.vx *= wanted / current
      projectile.vy *= wanted / current
      projectile.damage = boltDamageNow(projectile)
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- newFirebolt` → Expected: `ALL PASS`.
Run: `npm test` → Expected: every file passes.

- [ ] **Step 6: Commit**

```bash
git add src/data/genericUpgrades.ts src/sim/projectiles.ts tests/newFirebolt.test.ts
git commit -m "New Firebolt: Heavy or Accelerating Bolt, and Stoked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Backdraft, heat colours, tooltips, icon

**Files:**
- Modify: `src/render/effects.ts` (`drawHotStreakReady`, `drawProjectiles`), `src/sim/upgradeInfo.ts` (`SPELL_STATS`), `tools/extract-art.ps1` (`$spellIcons`)
- Test: `tests/newFirebolt.test.ts`

**Interfaces:**
- Consumes: `up_firebolt_backdraft` (Task 3), `Projectile.whiteHot`, `Projectile.heat` (Tasks 3 and 4).

- [ ] **Step 1: Write the failing test** — insert above the final `console.log`:

```ts
// --- Backdraft ---------------------------------------------------------------------

{
  const w = fireWorld()
  take(w, 'up_firebolt_backdraft')
  w.weapons[0].cooldownRemaining = 99
  w.lastHurtAt = w.time
  rebuildEnemyGrid(w)
  updateCombat(w, DT)
  check('Backdraft: hurt, and 8 plain bolts burst out', w.projectiles.length === 8 && w.projectiles.every((p) => !p.mutations), `${w.projectiles.length}`)
}
```

- [ ] **Step 2: Run it**

Run: `npm test -- newFirebolt`
Expected: PASS already: Backdraft runs on the existing `backdraft` stat, which the new upgrade sets. This test pins that down for the new spell; nothing to implement for it.

- [ ] **Step 3: Heat colours.** In `src/render/effects.ts` `drawProjectiles`, insert right after `const projectile = world.projectiles[i]`:

```ts
    // Heat (spellbook): white-hot for a Hot Streak, deepening red as Stoked
    // heats up. A glow round the bolt only; the bolt itself never grows.
    if (projectile.whiteHot) renderer.drawWorldOrb(projectile.x, projectile.y, projectile.radius * 1.6, FLIGHT_HEIGHT, '#ffffff', 0.85 * loudness)
    else if (projectile.heat) renderer.drawWorldOrb(projectile.x, projectile.y, projectile.radius * 1.5, FLIGHT_HEIGHT, '#ff2a14', Math.min(1, projectile.heat / 8) * loudness)
```

In `drawHotStreakReady`, change the `every` line so the glow at his feet also shows the new Hot Streak coming:

```ts
    const every = Math.round(weaponStat(world, weapon, 'hotStreak')) || Math.round(weaponStat(world, weapon, 'whiteHot'))
```

- [ ] **Step 4: Tooltip numbers.** In `src/sim/upgradeInfo.ts` `SPELL_STATS`, add after `fork`:

```ts
  split: { label: 'extra bolts', format: 'count' },
  stoked: { label: 'heat per enemy passed', format: 'percent' },
```

- [ ] **Step 5: Icon.** In `tools/extract-art.ps1` `$spellIcons`, add after the `spell_bolt_01` line:

```powershell
  'spell_firebolt_01'  = 'red\red_20'      # the new build's Firebolt: same streaking fireballs
```

Then regenerate the local art (it's gitignored and licensed, so it only exists on this machine):

Run: `powershell -ExecutionPolicy Bypass -File tools/extract-art.ps1`
Expected: it finishes without errors, and `art-source/icons/spell_firebolt_01.png` exists. If the art packs aren't on this machine, skip this: the game falls back to a plain badge, which is fine for testing.

- [ ] **Step 6: Run everything and type-check the game**

Run: `npm test` → Expected: every file passes, including the level-up card tests that check every tooltip number against what the game reads.
Run: `npx tsc --noEmit` → Expected: no output (the game type-checks; this includes the render changes the tests don't cover).

- [ ] **Step 7: Commit**

```bash
git add src/render/effects.ts src/sim/upgradeInfo.ts tools/extract-art.ps1 tests/newFirebolt.test.ts
git commit -m "New Firebolt: heat colours, tooltip numbers, icon" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Check it in the game, then stop for the playtest

**Files:** none changed (unless the check finds something).

- [ ] **Step 1: Start the game**

Use the preview tool: `preview_start` with name `idle-survivor` (from `.claude/launch.json` in `C:\AI\Claude`). Before any in-page stepping, restart the dev server if source files changed while it was running (a hot-updated module is a *different* copy, and stepping it gives nonsense). Check that `performance.getEntriesByType('resource')` shows no `?t=` URLs.

- [ ] **Step 2: The menu**

Open "Choose your first spell". Expected: **one card, Firebolt**, whose `button[data-spell]` is `spell_firebolt_01`. Take a screenshot.

- [ ] **Step 3: A run with the new Firebolt**

Pick Firebolt. In the console: `world().weapons[0].def.id` → Expected `"spell_firebolt_01"`. Let it play to its first level-ups and check the cards. Expected: only the new Firebolt's, meaning Pierce, Fork, Return, Split Shot, Heavy Bolt or Accelerating Bolt (always side by side), Ignite, Hot Streak, Backdraft, and later Kindling and Stoked once their prerequisites are in. Nothing old: no Hardy, Fleet Step, Kindled Fury, Combustion or Fireball. At level 6 no spell choice appears. Hover a card: the tooltip shows the new text. No console errors (`read_console_messages`). To see the end of the list quickly, raise the XP gain in the debug panel: once every upgrade is taken, the "Level up" button disappears even with levels unspent.

- [ ] **Step 4: The switch**

Debug panel → spells → `oldBuild` on, back to the menu. Expected: the three old starters, and a run with the old Firebolt shows the old cards (Hardy, Combustion...). Switch it back off.

- [ ] **Step 5: Stop**

Report to the user with screenshots: what's in, the build switch, and what to try (Hot Streak's white bolt every 5th cast, Stoked's red with Pierce, Accelerating vs Heavy, Split Shot plus Kindling spreading burns). **Wait for the playtest.** When the user approves, tag it:

```bash
git tag step-28
```

(Don't push unless the user asks; pushing `main` deploys the site, and the built page in `docs/` hasn't been rebuilt.)
