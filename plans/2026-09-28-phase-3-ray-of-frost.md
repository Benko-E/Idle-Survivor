# Phase 3: Ray of Frost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ray of Frost, the new build's frost starter: a new `beam` behaviour, its generic beam upgrades (Pierce, Fork), and its five mutations (Frostbite, Flash Freeze, Winter's Breath, Cold Snap, Cold Shoulder). Evolutions (Glacial Sweep, Winding Ray) are Phase 4.

**Architecture:** A new behaviour, `beam`, in `src/sim/beams.ts`, registered in the behaviour registry. It "casts" on a short tick like the orbit and body spells. Between ticks the spell keeps its own state on `WeaponInstance.beam`: the enemy it holds, the enemies it touches, a fork target, per-enemy cold, and the Cold Snap timer. It deals `damage` per second, pro-rated per tick. The renderer draws the beam from that state every frame, following the enemies. Chill is managed by the beam itself (a new `setCondition` in statusEffects sets a condition's strength exactly, so chill can fade instead of only ever rising). Freezing uses the existing `frozen` condition, including its 2-second immunity after thawing. Cold Shoulder is a reaction like Backdraft; both move into `src/sim/reactions.ts`.

**Tech Stack:** TypeScript, Vite, `npm test`.

**Spec:** spellbook (https://claude.ai/artifact/AKfux2VDnpPyZe47TsCZ9J, Version 12): Ray of Frost; Generic beam upgrades (Beam Pierce, Beam Fork; **Beam Split dropped**: it was Claude's idea, never chosen). Roadmap: `plans/2026-09-28-new-build-roadmap.md`.

## Global Constraints

- **Base Ray:** locks onto the nearest enemy and holds until it dies, then snaps to the next nearest. Frost damage and nothing else: no chill without Frostbite.
- **"Touched"** = whatever the beam is touching right now (its target, plus anything pierced). Mutations act on everything touched.
- **Frozen** = can't move; stays frozen while touched and 2 s after. Chill fades over 2 s. Freeze at 3 s of being touched.
- **Spawns are plain:** Beam Fork is a plain beam: a share of the damage, no chill, no push, no freeze.
- Tier 1 leaves nothing behind. Base spells don't change his AI (Winter's Breath moves enemies, not him).
- Card lines ≤45 characters. The old build is unchanged. Workflow: commit on main, test, build, push, tag `step-30`.

## Review Focus

1. **The held enemy dies, or walks out of range** → the beam snaps to the next nearest at once; with nothing in range it idles (no damage, no drawing) and picks up again when something arrives.
2. **Chill after the beam leaves** → fades to nothing over about 2 s; an enemy that was frozen thaws 2 s after the beam leaves, then can't be refrozen for 2 s (existing immunity).
3. **Flash Freeze when everything in range is frozen** → the beam stays where it is rather than flickering between frozen enemies.
4. **Winter's Breath into a tree** → the pushed enemy is pushed back out of the trunk by the existing obstacle code, never stuck inside.
5. **Cold Shoulder in a crowd** → at most once every 10 s, and it freezes only enemies touching him.

## Starting numbers (spellbook where it gives them, otherwise first guesses for balance day)

- Spell: tick (`cooldown`) 0.1 s; `damage` 10 per second (the old Frostbolt did about 7 a second, Firebolt about 9.5); `range` 340.
- `config.beam`:
  - `width` 10 (how close to the line counts as touched)
  - `pierceReach` 140 (how far past the target Pierce reaches)
  - `forkRange` 160, `forkShare` 0.5
  - `freezeSeconds` 3, `chillFadeSeconds` 2, `frozenLinger` 2, `maxChill` 0.7 (the slow just before freezing)
  - `snapFlash` 0.25 s (Cold Snap's white flash), `coldShoulderCooldown` 10
- Upgrades:
  - Frostbite: `frostbite` 1
  - Flash Freeze: `flashFreeze` 1, needs Frostbite
  - Winter's Breath: `wintersBreath` 20 (a push of 20 a second)
  - Cold Snap: `coldSnap` 6 (every 6 s)
  - Cold Shoulder: `coldShoulder` 1.5 (freeze seconds)
  - Beam Pierce: `pierce` +1, 3 picks
  - Beam Fork: `fork` +1, 2 picks

---

### Task 1: The beam, and the spell

**Files:** create `src/sim/beams.ts`; modify `src/sim/behaviours.ts` (register `beam`), `src/sim/world.ts` (`WeaponInstance.beam?`), `src/config.ts` (`beam`), `src/data/weapons.ts` (`spell_ray_of_frost_01`, `build: 'new'`, tier 1, tags `spell, frost, beam`), `src/sim/statusEffects.ts` (`setCondition`). Test: `tests/rayOfFrost.test.ts`.

- [ ] **Step 1: Failing tests** (new file, same helpers as newFirebolt.test.ts: `check`, `up`, `take`, `eligible`, `enemy`, `lost`, a `frostWorld()` making a run with the Ray, `fly(world, seconds)` stepping `rebuildEnemyGrid` + `updateCombat`):
  - The new build's tier 1 offers the Ray (alongside Firebolt).
  - With enemies at 80 and 150, after 1 s only the nearer one has lost health, about `damage` × 1 s (±15%), and it has no chill.
  - The held enemy dies (hp set to 0 mid-way) → the other enemy starts losing health within 0.2 s.
  - Nothing in range (the only enemy at 600) → after 1 s it has lost nothing, and `beam.path` is empty.
  - The held enemy moves out of range (x set to 900) → the beam lets go.
- [ ] **Step 2:** run → FAIL (no such weapon definition).
- [ ] **Step 3: Implement** `beam` in beams.ts:
  - **Target:** keep `state.target` while it's alive and within `range`; otherwise take the nearest enemy in range (none → clear the path, return `false`).
  - **Touched:** `path = [target]`; Pierce extends it in Task 2.
  - **Each tick:** deal `damage × tick` to everything touched (`tick = stat('cooldown')`). Mutations act on the touched list.
  - **State:** `WeaponInstance.beam = { target?: Enemy; path: Enemy[]; forkTo?: Enemy; cold: Map<number, number>; snapTimer: number; flashUntil: number }`.
  - **`setCondition(world, enemy, id, magnitude, duration, source)`** in statusEffects: like `applyCondition` for 'refresh' conditions, but it sets the magnitude outright instead of keeping the stronger one; magnitude ≤ 0 removes it.
- [ ] **Step 4:** tests pass; the full suite passes (the Firebolt tests don't care about a second tier-1 spell; `newBuild.test.ts` checks the list includes, not equals).
- [ ] **Step 5: Commit** "New build: Ray of Frost, the beam".

### Task 2: Beam Pierce and Beam Fork (the generic beam list)

**Files:** `src/data/genericUpgrades.ts` (`beamUpgrades(spellId, prefix)`), `src/data/upgrades.ts` (`...beamUpgrades('spell_ray_of_frost_01', 'up_ray')`), `src/sim/beams.ts`. Test: rayOfFrost.test.ts.

- [ ] **Step 1: Failing tests:**
  - **Pierce ×1:** an enemy just behind the target (on the line, within `pierceReach`) also takes damage; one far off the line doesn't.
  - **Fork ×1:** a second enemy beside the target (within `forkRange`) takes damage at about `forkShare` of the rate. With Frostbite taken (Task 3 adds it; until then this check is on damage only), the fork's enemy never gets chilled.
  - The Ray's cards never include the bolt list's Return, Heavy, Split and so on.
- [ ] **Step 3: Implement.**
  - **Pierce:** enemies whose distance to the ray (the line from him through the target, extended `pierceReach` past it) is within `width` + their radius, beyond the target, nearest first, up to `pierce` of them. Frozen ones are passed through for free when he has Flash Freeze (Task 3's rule), so they don't use up a pierce but are still touched.
  - **Fork:** the nearest enemy to the target within `forkRange` that isn't touched. It takes `forkShare × damage × tick`, and nothing else happens to it (it's plain).
  - **Cards:** Beam Pierce, "The beam passes through 1 more enemy", 3 picks; Beam Fork, "A second beam splits off to another enemy", 2 picks (each pick adds another plain fork to the next nearest).
- [ ] **Step 5: Commit** "Ray of Frost: Beam Pierce and Beam Fork".

### Task 3: The mutations

**Files:** `src/sim/beams.ts`, `src/sim/reactions.ts` (new: Backdraft moved here from combat.ts unchanged, plus Cold Shoulder), `src/sim/combat.ts` (calls `updateReactions`), `src/data/upgrades.ts`. Test: rayOfFrost.test.ts.

- [ ] **Step 1: Failing tests:**
  - **Frostbite:**
    - Chill grows while held: slow about 0.35 at 1.5 s.
    - The enemy is frozen by 3.1 s (`isHeld`) and still frozen at 5 s while held.
    - After the beam lets go (enemy moved out of range): still frozen 1.5 s later, thawed by 2.3 s. A chilled but not frozen enemy's slow is gone about 2 s after the beam leaves.
  - **Flash Freeze:**
    - Not offered without Frostbite.
    - With it, once the target freezes the beam moves to the other enemy.
    - With every enemy frozen, it stays put and doesn't switch every tick (the target is the same over 1 s).
  - **Winter's Breath:**
    - The target's distance from him grows by about 20 a second (it has speed 0 in the test).
    - With Frostbite, it stops moving once frozen.
  - **Cold Snap:**
    - Without Frostbite, the held enemy is frozen by 6.1 s.
    - The beam's `flashUntil` is set when it goes off.
  - **Cold Shoulder:**
    - `lastHurtAt = time` with two enemies touching him and one farther off: the two freeze for about 1.5 s, the far one doesn't.
    - Hurt again 2 s later: nothing new (cooldown). After 10 s: it fires again.
  - **Backdraft still works** (the old and new Firebolt tests cover that the move changed nothing).
- [ ] **Step 3: Implement.**
  - **Frostbite:**
    - Each tick, `cold += tick` for touched enemies. Untouched enemies in the map lose `tick × freezeSeconds / chillFadeSeconds` and are dropped at 0.
    - Chill: `setCondition('chilled', maxChill × min(1, cold / freezeSeconds), duration tick × 2)` on every enemy in the map.
    - At `cold ≥ freezeSeconds` on a touched enemy: `applyCondition('frozen', 1, frozenLinger + tick)`. Refreshing it while touched keeps it frozen, and it lasts `frozenLinger` after the beam leaves.
  - **Flash Freeze:** when choosing the target, a held target that is frozen (`isHeld`) is dropped for the nearest enemy that isn't frozen. If there isn't one, keep it.
  - **Winter's Breath:** each touched, unfrozen enemy moves `wintersBreath × tick` directly away from him. The obstacle code pushes it out of trees on the next frame.
  - **Cold Snap:** the timer counts down while the beam is on. At zero, apply `frozen` (`frozenLinger`) to everything touched, set `flashUntil = time + snapFlash`, and reset to `coldSnap`.
  - **Cold Shoulder:** in reactions.ts, on the same "hurt this step" test as Backdraft. For each spell with `coldShoulder > 0` and past its ready time, freeze the enemies touching him (edge to edge, like contact damage) for `coldShoulder` seconds, then wait `coldShoulderCooldown`.
  - **Cards:** text from the spellbook.

    | Upgrade | Card line |
    |---|---|
    | Frostbite | "The beam chills enemies until they freeze" |
    | Flash Freeze | "The beam moves on once its target freezes" |
    | Winter's Breath | "The beam gently pushes enemies away" |
    | Cold Snap | "Now and then the beam flashes and freezes" |
    | Cold Shoulder | "Enemies that hit him freeze for a moment" |
- [ ] **Step 5: Commit** "Ray of Frost: Frostbite, Flash Freeze, Winter's Breath, Cold Snap, Cold Shoulder".

### Task 4: Drawing it, then ship

**Files:** `src/render/effects.ts` (`drawBeams`), `src/sim/upgradeInfo.ts` (labels), `tools/extract-art.ps1` (icon).

- [ ] **Drawing:** for each spell with `beam.path` non-empty, draw from him through each touched enemy: a wide faint line under a thin bright one in the spell's colour, white while `flashUntil > time`. Draw each fork from the target to its enemy, thinner.
- [ ] **Labels and icon:** labels for `wintersBreath` ("push per second") and `coldShoulder` ("freeze on hit, seconds"). Icon `spell_ray_of_frost_01` = `blue\blue_21`; rerun extract-art.
- [ ] **Check and ship:**
  - `npx tsc --noEmit`, `npm test`.
  - In the game: the menu now has two cards; a Ray run; screenshot a beam; take Frostbite and see enemies freeze; no console errors.
  - Final review (fresh reviewer), then fixes.
  - `npm run build`, commit "Step 30: Ray of Frost" with `docs/index.html`, tag `step-30`, push both, check the live page.
