# Phase 5: Chain Lightning — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (native). Checkbox steps. Standing go-ahead: plan → build → review → fixes → commit → push → tag, no check-ins.

**Goal:** The new build's Chain Lightning (`spell_chain_lightning_01`): the generic chain list (+1 Jump, Branching) and its five mutations: Shock, Conduction, Overload, Crescendo and Static Discharge. Evolutions (Storm Web, Wandering Spark) are Phase 6.

**Architecture:** A new behaviour, `arc`, in `src/sim/chains.ts`. The old `chain` behaviour stays untouched for the old build.
- **A chain is an object that hops.** A normal cast runs all its hops at once (instant). A creeping chain (Overload) waits `chain.creepSeconds` between hops, kept in `world.chains` and advanced by `updateChains`. Phase 6's Wandering Spark reuses the same hopping chain with its own hop delay.
- **Before each hop deals damage, the chain looks ahead** to find its next target. That way it knows whether this is the last hit, which Crescendo needs.
- **Static Discharge joins Backdraft and Cold Shoulder** in `reactions.ts`.

**Spec:** spellbook Version 12: Chain Lightning; generic chain list; the ELEMENTS signature-condition rule. Roadmap Phase 5.

## Global Constraints

- **Base:** strikes the nearest enemy, then jumps to 3 more nearby. Never the same enemy twice in one cast. Each jump is a little weaker. Instant, leaves nothing behind. Casts about once a second.
- **Shock:** +20% damage taken from *everything*, for 3 s. It doesn't stack. It's one-way: nothing triggers when an enemy becomes shocked. It uses the existing `shocked` condition.
- **Conduction** (needs Shock): a jump onto a shocked enemy doesn't use up a jump. No cap; "never the same enemy twice per cast" is the limit.
- **Overload:** every 5th cast has twice the jumps (+1 Jump picks double too), and it creeps: each jump takes a visible `creepSeconds` (0.08).
- **Crescendo:** replaces the weakening. The first hit is 0.5×, +25% per jump, and the last hit is doubled. It grows per jump, so a longer chain gets a bigger last hit.
- **Static Discharge:** when an enemy hits him, plain arcs go into up to 6 enemies close around him, then a 5 s wait. Plain means his base hit and none of the upgrades.
- **Branching:** the first jump also sends a plain branch to another nearby enemy. It's an instant arc at a share of the hit (`chain.branchShare` 0.5; the spellbook leaves this undecided, so 0.5 matches Fork).
- Card lines ≤45 characters. The old build is unchanged. Workflow: commit, test, build, push, tag `step-32`.

## Review Focus

1. **Nothing in range, or only one enemy** → no cast with nothing in range; a single enemy takes one hit and the cast still counts.
2. **Conduction in a crowd that's all shocked** → the chain stops at the last connected shocked enemy (never loops, never hits one twice).
3. **An Overload chain whose next target dies mid-creep** → it finds a new next target from where it is, or ends cleanly.
4. **Crescendo's last hit when the chain ends early** (no enemy in jump range) → the doubled hit lands on whichever enemy really was last.
5. **Static Discharge in a crowd** → at most once every 5 s, at most 6 arcs, only enemies close to him.

## Starting numbers (balance day later)

- Spell: `cooldown` 1, `damage` 8, `count` 3 (jumps), `range` 400, `jumpRange` 165, `falloff` 0.85.
- `config.chain`: `creepSeconds` 0.08, `branchShare` 0.5, `branchRange` 165, `staticRange` 160, `staticCooldown` 5, `shockSeconds` 3.
- Upgrades (stats):

  | Upgrade | Stat and value | Picks |
  |---|---|---|
  | +1 Jump | `count` +1 | 3 |
  | Branching | `branch` +1 | 1 |
  | Shock | `shock` 0.2 | |
  | Conduction | `conduction` 1 | needs Shock |
  | Overload | `overload` 5 (every 5th cast) | |
  | Crescendo | `crescendo` 1 | |
  | Static Discharge | `staticDischarge` 6 (arcs) | |

---

### Task 1: The chain, and the spell

- [ ] **Failing tests** (`tests/newChainLightning.test.ts`):
  - The new build's tier 1 now offers all three new starters.
  - 5 enemies 100 apart in a line: the first four are hit, at base × 0.85^k; the fifth isn't.
  - It never hits the same enemy twice (two enemies only: two hits, no bounce back).
  - Nothing in range: no damage.
- [ ] **Implement** `chains.ts`:
  - The `arc` behaviour and the `Chain` type (`weapon`, `x`, `y`, `struck`, `jumpsLeft`, `hop` index, `delay`, `timer`, `current`, `next`).
  - `hopOnce`: deal damage to the current enemy, then advance. `runChain` runs a delay-0 chain to the end; `updateChains(world, dt)` advances creeping ones.
  - Draw each link with `spawnArtLine` using `fx.arc`, and a hit spark.
  - Register `arc`. Call `updateChains` in combat after the casts. Add `world.chains`.
- [ ] **The spell:** `spell_chain_lightning_01`: tier 1, `build: 'new'`, tags `spell, lightning, chain`, behaviour `arc`, the stats above, `fx` like the old one, colour `#c9a6ff`.
- [ ] Commit "New build: Chain Lightning".

### Task 2: Generic chain list, Shock, Conduction, Crescendo

- [ ] **Failing tests:**
  - +1 Jump: five enemies are hit. The card is only offered with this spell.
  - Branching: an enemy beside the first target takes `branchShare` × the first hit, and nothing else happens to it.
  - Shock: hit enemies are `shocked` at 0.2 for about 3 s. Damage from another source (`damageEnemy` with a null source) to a shocked enemy is ×1.2. Hitting it again doesn't stack.
  - Conduction: not offered without Shock. With 8 pre-shocked enemies in a line, all 8 are hit. With 8 unshocked, only 4.
  - Crescendo: 4 hits at 0.5, 0.75, 1.0 and 2.5 × base. If the chain ends after 2 hits, the second gets its ×2.
- [ ] **Implement:** `chainUpgrades(spellId, prefix)` in genericUpgrades.ts; the mutations as stats read in `chains.ts`.
- [ ] Commit "Chain Lightning: +1 Jump, Branching, Shock, Conduction, Crescendo".

### Task 3: Overload and Static Discharge

- [ ] **Failing tests:**
  - Overload: casts 1–4 hit 4 enemies. Cast 5 hits 1 at once, and 7 within 0.7 s (it creeps). Its next target dying mid-creep doesn't stop it: it jumps on from where it is.
  - Static Discharge: `lastHurtAt = time` with 8 enemies close around him and one far away: exactly 6 close ones take base damage, the far one takes none. Hurt again 2 s later: nothing. After 5 s: again.
- [ ] **Implement:** the Overload counter on `weapon.streak` (doubled jumps, delay `creepSeconds`, a white arc colour); `staticDischarge` in reactions.ts.
- [ ] Commit "Chain Lightning: Overload and Static Discharge".

### Task 4: Check, review, ship

- [ ] Tooltip labels for `branch` and `staticDischarge`. Icon `spell_chain_lightning_01` = `violet\violet_01`; rerun extract-art.
- [ ] `npx tsc --noEmit`, `npm test`. In the game: three starter cards; a Chain run; screenshot; no console errors.
- [ ] Fresh reviewer, then fixes.
- [ ] `npm run build`, commit "Step 32: Chain Lightning" with `docs/index.html`, tag `step-32`, push both, check the live page.
