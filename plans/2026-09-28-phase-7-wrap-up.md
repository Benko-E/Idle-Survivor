# Phase 7: Wrap-up — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (native). Standing go-ahead: plan → build → review → fixes → commit → push → tag.

**Goal:** Leave the new build tidy: the measuring tools use the new starters by default, and the README describes the game as it now is.

**Spec:** roadmap `2026-09-28-new-build-roadmap.md`, Phase 7 ("benches default to the new starters (`STARTERS`), icons for the new ids, README notes").

## Global Constraints

- The old build stays reachable (`config.spells.oldBuild`) and documented as such. It isn't deleted.
- There are no gameplay changes in this phase.
- Workflow: commit, test, build, push, tag `step-34`.

## Review Focus

1. **Running the bench with no options** → it plays the three new starters and doesn't crash on the new behaviours (beam, arc).
2. **README accuracy** → every file, config key and id it names exists.

---

### Task 1: Bench defaults

- **Icons:** already done in Phases 1, 3 and 5 (`tools/extract-art.ps1`). Check that they exist; nothing to build.
- [ ] **Failing test** (`tests/newBuild.test.ts`): the default `STARTERS` in `tools/bench/run.mjs` are exactly the new build's tier-1 spells.
- [ ] **Implement:** change the default to `spell_firebolt_01,spell_ray_of_frost_01,spell_chain_lightning_01`.
- [ ] **Smoke run:** `npm run bench -- survival --seeds=1 --max=60 --name=smoke` gives results for all three with no errors. Then delete the smoke results.
- [ ] Commit "Bench: new starters by default".

### Task 2: README notes

- [ ] Update the Spells section:
  - The new build: three tier-1 starters, each with 5 mutations and 2 exclusive level-20 evolutions, plus the generic bolt, beam and chain lists.
  - Tiers 2 and 3 are empty for now.
  - The old build sits behind `config.spells.oldBuild`.
- [ ] Add the `beam` and `arc` behaviours to the behaviours table, and name the files: `sim/beams.ts`, `sim/chains.ts`, `sim/reactions.ts`.
- [ ] Update the bench note (it now uses the new starters).
- [ ] Commit "README: the new build".

### Task 3: Check, review, ship

- [ ] `npm test`, `npm run bench -- audit` runs.
- [ ] Fresh reviewer, then fixes.
- [ ] `npm run build`, commit "Step 34: wrap-up", tag `step-34`, push, check live.
