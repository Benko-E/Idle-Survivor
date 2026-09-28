# Phase 2: Firebolt's Evolutions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose native execution). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pinwheel and Salvo, the new Firebolt's two exclusive level-20 evolutions, plus the fix that makes level 20 reachable for a run that has run out of picks.

**Architecture:** Both evolutions are new projectile stats (`pinwheel`, `salvo`), so the old build never sees them. Pinwheel is a flight mode on the bolt: the first hit is free and starts an outward spiral from that point; it keeps the bolt's total flight time. Salvo is a cast mode: casts add bolt specs to a per-spell stack, and at 5 the stack is released at once. The bolt-spawning loop is refactored to take a list of bolt specs, so a normal cast and a Salvo release share one path. Levels with nothing to pick are no longer banked, which keeps `draftLevel` honest.

**Tech Stack:** TypeScript, Vite, `npm test` (per-file processes; `FAIL` or a non-zero exit fails).

**Spec:** spellbook (https://claude.ai/artifact/AKfux2VDnpPyZe47TsCZ9J, Version 12), Firebolt → Pinwheel, Salvo. Roadmap: `plans/2026-09-28-new-build-roadmap.md`.

## Global Constraints

- Card lines ≤45 characters. Evolutions are `kind: 'evolution'`, exclusive per spell (the draft already enforces it), offered from level 20 (`draft.evolutionLevel`).
- Spawns stay plain: forks and Backdraft bolts fly straight, never spiral, never join a Salvo stack.
- The old build is unchanged: every existing test stays green.
- Workflow (user): commit on `main` with named commits, run tests, then `npm run build`, commit `docs/index.html`, push, tag the step. No branches.

## Review Focus

1. **A run that ran dry before level 20** → still gets the two evolution cards at level 20. (Task 1)
2. **Pinwheel with no hit at all** (its target died, or it missed) → it still spirals, from where its straight flight ended, and still ends on time. (Task 2)
3. **Pinwheel with Return** → when the spiral ends it flies straight home, not in circles. (Task 2)
4. **Salvo with nothing in range** → the stack fills to 5 and waits; it doesn't waste casts or fire at nothing. (Task 3)
5. **Salvo with Split Shot** → never more than 5 bolts per release; the extra bolt stays for the next one. (Task 3)

## Rulings made while planning

- **Unspendable levels aren't banked.** Phase 1's review found that a dry run's banked levels freeze `draftLevel` (level minus pending) below 20, so evolutions could never unlock. A level with nothing to pick now simply passes; the next level that has something is banked as usual. Cost if wrong: the player "loses" levels that had nothing in them anyway.
- **Pinwheel's straight part is capped at 60% of its flight** (`combat.pinwheelStraight`). The spec wants both "spirals from where it ended up if it hit nothing" and "flight time stays the same as a normal bolt's", which can't both hold if the straight part uses the whole flight. So a bolt that hits nothing starts spiralling after 60% of its life, and the spiral uses the rest.
- **Salvo keeps overflow.** With Split Shot (3 bolts a cast), the stack goes 3, then 6: 5 are released and 1 stays. Nothing is wasted, and there are never more than 5 per release.
- **A caught returning bolt** adds half a charge. Two halves make one extra bolt in the stack, a non-main one, so it can't start its own return loop.

---

### Task 1: Levels with nothing to pick aren't banked

**Files:** Modify `src/sim/progression.ts` (`grantXp`). Test: `tests/newFirebolt.test.ts`.

- [ ] **Step 1: Failing test.** Add `import { grantXp, xpForLevel } from '@game/sim/progression'` and `import { currentOffers } from '@game/sim/draft'` (merge into the existing draft import), then above the final `console.log`:

```ts
// --- Running dry before level 20 --------------------------------------------------

{
  const w = fireWorld()
  // Every ordinary upgrade there is for the new Firebolt.
  for (const def of UPGRADE_DEFS) {
    if (def.spellId !== FIREBOLT || def.kind === 'evolution' || def.id === 'up_firebolt_accelerating') continue
    for (let i = 0; i < def.maxStacks; i++) applyUpgrade(w, def)
  }
  while (w.level < 20) grantXp(w, xpForLevel(w.level))
  const offered = currentOffers(w).map((offer) => offer.id)
  check('Ran dry: levels with nothing to pick are not saved up', w.pendingLevelUps === 1, `${w.pendingLevelUps} waiting`)
  check('...so level 20 still deals the evolutions', offered.includes('up_firebolt_pinwheel') && offered.includes('up_firebolt_salvo'), offered.join(', '))
}
```

- [ ] **Step 2:** `npm test -- newFirebolt` → Expected FAIL: pending is about 19 (and the evolution upgrades don't exist yet).
- [ ] **Step 3: Implement.** In `src/sim/progression.ts` add `import { hasOffers } from './draft'` and, in `grantXp`'s loop, after `world.pendingLevelUps++`:

```ts
    // A level with nothing to pick passes rather than waiting forever: saved-up
    // levels would hold draftLevel below the levels that do have something,
    // like level 20's evolutions.
    if (!hasOffers(world)) world.pendingLevelUps--
```

- [ ] **Step 4:** the test still fails until Task 2 and 3's evolutions exist; its first check passes now. Run the whole suite: every file except this one's evolution check passes.
- [ ] **Step 5: Commit** `git commit -m "Levels with nothing to pick pass instead of piling up"`.

### Task 2: Pinwheel

**Files:** `src/sim/projectiles.ts` (BoltMutations, Projectile, `hit` returns whether the hit was free, flight), `src/sim/behaviours.ts` (reads `pinwheel`), `src/config.ts` (`pinwheelStraight: 0.6`, `pinwheelStart: 10`, `pinwheelOpen: 90`), `src/data/upgrades.ts`. Test: `tests/newFirebolt.test.ts`.

- [ ] **Step 1: Failing tests** (above the final `console.log`):

```ts
// --- Pinwheel ---------------------------------------------------------------------

{
  const w = fireWorld()
  w.level = 20
  check('Pinwheel is an evolution, offered at 20', up('up_firebolt_pinwheel').kind === 'evolution' && eligible(w, 'up_firebolt_pinwheel'))
  take(w, 'up_firebolt_pinwheel')
  check('...and rules out Salvo', !eligible(w, 'up_firebolt_salvo'))
  const target = enemy(w, 100, 0)
  // Around the target, where the spiral passes.
  const ring = [0, 1, 2, 3, 4, 5].map((k) => enemy(w, 100 + Math.cos(k) * 30, Math.sin(k) * 30))
  cast(w)
  const bolt = w.projectiles[0]
  let spiralled = false
  let spreadOut = 0
  for (let i = 0; i < 120 && w.projectiles.includes(bolt); i++) {
    fly(w, DT)
    if (bolt.spiral) {
      spiralled = true
      spreadOut = Math.max(spreadOut, Math.hypot(bolt.x - bolt.spiral.x, bolt.y - bolt.spiral.y))
    }
  }
  const hits = [target, ...ring].filter((e) => lost(e) > 0).length
  check('...the first hit is free and starts a spiral', spiralled && lost(target) > 0)
  check('...no Pierce: one more enemy, then gone', hits === 2 && !w.projectiles.includes(bolt), `${hits} hit`)
  check('...and the spiral opens outward', spreadOut > config.combat.pinwheelStart, spreadOut.toFixed(1))
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_pinwheel')
  enemy(w, 500, 0)
  cast(w)
  const bolt = w.projectiles[0]
  const life = bolt.life
  let spiralAt = -1
  let steps = 0
  for (; steps < 400 && w.projectiles.includes(bolt); steps++) {
    fly(w, DT)
    if (bolt.spiral && spiralAt < 0) spiralAt = steps * DT
  }
  check('Pinwheel missing everything: spirals where the straight part ends', near(spiralAt, life * config.combat.pinwheelStraight, 0.05), `${spiralAt.toFixed(2)}s of ${life.toFixed(2)}s`)
  check('...and still ends on time', near(steps * DT, life, 0.05), `${(steps * DT).toFixed(2)}s`)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_pinwheel')
  take(w, 'up_firebolt_return')
  enemy(w, 100, 0)
  enemy(w, 130, 0)
  cast(w)
  const bolt = w.projectiles[0]
  let home = false
  let spiralWhileReturning = false
  for (let i = 0; i < 300; i++) {
    fly(w, DT)
    if (bolt.returning && bolt.spiral) spiralWhileReturning = true
    if (!w.projectiles.includes(bolt)) { home = true; break }
  }
  check('Pinwheel + Return: flies straight home after the spiral', home && !spiralWhileReturning)
}
```

- [ ] **Step 2:** run → FAIL (`No upgrade "up_firebolt_pinwheel"` / `spiral` missing).
- [ ] **Step 3: Implement.**
  - `BoltMutations.pinwheel: boolean`; the behaviour reads `pinwheel: stat('pinwheel') > 0` and counts it in `mutated`. The literal in `tests/summons.test.ts` gets `pinwheel: false`.
  - `Projectile.spiral?: { x: number; y: number; angle: number; radius: number }`.
  - `startSpiral(projectile, x, y)`: centre at (x, y), `radius: pinwheelStart`, angle from the centre to the bolt.
  - `hit()` returns `true` when this hit started the spiral. In `updateProjectiles` a free hit skips the pierce, return and spent handling.
  - Flight: if `pinwheel && !spiral && !returning` and the bolt has used `pinwheelStraight` of its `outLife`, start the spiral where it is. While spiralling: `radius += pinwheelOpen * dt`, `angle += speed * dt / radius`, and the new position is the centre plus radius × (cos, sin) of the angle. `vx`/`vy` are set from the step's movement, so Accelerating's speed rescale still applies. `turnBack` clears `spiral`.
  - Upgrade `up_firebolt_pinwheel`: kind evolution, card "After its first hit, the bolt spirals out", tooltip from the spellbook, `modifiers: [{ target: 'pinwheel', op: 'add', value: 1 }]`, `maxStacks 1`, `weight 400`.
- [ ] **Step 4:** tests pass; full suite passes.
- [ ] **Step 5: Commit** "New Firebolt: Pinwheel".

### Task 3: Salvo

**Files:** `src/sim/behaviours.ts` (the bolt loop takes specs; Salvo stack), `src/sim/world.ts` (`WeaponInstance.salvo?`), `src/sim/projectiles.ts` (a caught bolt adds half a charge), `src/config.ts` (`salvoStack: 5`, `salvoCatch: 0.5`), `src/data/upgrades.ts`. Test: `tests/newFirebolt.test.ts`.

- [ ] **Step 1: Failing tests:**

```ts
// --- Salvo --------------------------------------------------------------------------

{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  const pack = [0, 1, 2, 3, 4].map((k) => enemy(w, 120, -80 + k * 40))
  for (let n = 0; n < 4; n++) cast(w)
  check('Salvo: casts gather over his head, none fly yet', w.projectiles.length === 0 && w.weapons[0].salvo?.bolts.length === 4, `${w.weapons[0].salvo?.bolts.length} gathered`)
  cast(w)
  const targets = new Set(w.projectiles.map((b) => b.targetId))
  check('...at 5 they all fly out at once', w.projectiles.length === 5 && w.weapons[0].salvo?.bolts.length === 0)
  check('...each at its own enemy', targets.size === 5 && pack.every((e) => targets.has(e.id)))
  check('...same damage per bolt as ever', w.projectiles.every((b) => near(b.damage, damageOf(w))))
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  for (let n = 0; n < 8; n++) cast(w)
  check('Salvo, nothing in range: fills to 5 and waits', w.projectiles.length === 0 && w.weapons[0].salvo?.bolts.length === 5)
  enemy(w, 150, 0)
  cast(w)
  check('...and lets go once something turns up', w.projectiles.length === 5)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_split', 2)
  enemy(w, 150, 0)
  cast(w)
  check('Salvo + Split Shot: a cast adds 3 weaker bolts', w.weapons[0].salvo?.bolts.length === 3 && w.projectiles.length === 0)
  cast(w)
  check('...never more than 5 a release, the extra waits', w.projectiles.length === 5 && w.weapons[0].salvo?.bolts.length === 1)
  check('...one main bolt per cast', w.projectiles.filter((b) => (b.mutations?.fork ?? 0) > 0 || (b.mutations?.returns ?? 0) > 0).length <= 2)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_hotstreak')
  enemy(w, 150, 0)
  for (let n = 0; n < 5; n++) cast(w)
  check('Salvo + Hot Streak: one white-hot bolt a volley', w.projectiles.filter((b) => b.whiteHot).length === 1)
}
{
  const w = fireWorld()
  w.level = 20
  take(w, 'up_firebolt_salvo')
  take(w, 'up_firebolt_return')
  enemy(w, 120, 0)
  for (let n = 0; n < 5; n++) cast(w)
  fly(w, 3)
  const salvo = w.weapons[0].salvo!
  check('Salvo + Return: each caught bolt is half a charge', near(salvo.bolts.length + salvo.partial, 5 * config.combat.salvoCatch), `${salvo.bolts.length} + ${salvo.partial}`)
}
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `WeaponInstance.salvo?: { bolts: BoltSpec[]; partial: number }`, with `BoltSpec = { damage: number; white: boolean; main: boolean }` exported from behaviours.ts.
  - The projectile behaviour builds this cast's specs (`volley` of them, the first `count` main, damage `shared`, `white`).
  - Without Salvo, it spawns them as before.
  - With Salvo:
    - Push the specs onto the stack (the charge happens even with no target).
    - If the stack is below `salvoStack`, return `true` (the cast charged).
    - Otherwise look for targets for up to `salvoStack` bolts. None: return `false` (keeps the stack, retries shortly).
    - Found: release the first `salvoStack` specs at them (Kindling's unburnt targets if he has it) and keep the rest.
  - Spawning is one helper `launch(spec, angle, ...)`, shared by both.
  - In `updateProjectiles`, a returning bolt caught by a caster whose spell has `salvo` adds `salvoCatch` to `partial`. At `partial >= 1` it becomes one non-main spec of the spell's plain `shared` damage.
  - Upgrade `up_firebolt_salvo`: kind evolution, card "Bolts gather overhead, then fly out at once", tooltip from the spellbook, `salvo` add 1, `maxStacks 1`, `weight 400`.
- [ ] **Step 4:** all tests pass, including Task 1's evolution check; full suite passes.
- [ ] **Step 5: Commit** "New Firebolt: Salvo".

### Task 4: The look, then ship

**Files:** `src/render/effects.ts` (the Salvo cluster over his head), `src/sim/upgradeInfo.ts` (none needed: evolutions explain themselves in their tooltips).

- [ ] **Step 1:** draw each gathered bolt as a small orb in a tight cluster above his head: `drawWorldOrb` at the character's position plus a small fixed offset per slot, lifted to `FLIGHT_HEIGHT + 22`, in the spell's colour. Never circling (Tier 2's look).
- [ ] **Step 2:** `npx tsc --noEmit`, `npm test`; in the game, take each evolution through the debug panel or by granting levels, and screenshot a spiral and a gathered stack; no console errors.
- [ ] **Step 3: Commit** "New Firebolt: Salvo's gathered bolts over his head". Then the final whole-branch review (fresh reviewer), fixes, and ship: `npm run build`, commit "Step 29: Firebolt's evolutions, Pinwheel and Salvo" with `docs/index.html`, tag `step-29`, `git push origin main`, `git push origin step-29`, then check the live page.
