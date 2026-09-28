# Phase 6: Chain Lightning's Evolutions — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (native). Standing go-ahead: plan → build → review → fixes → commit → push → tag.

**Goal:** Storm Web and Wandering Spark, Chain Lightning's two exclusive level-20 evolutions.

**Architecture:** Both reuse Phase 5's hopping `Chain`.
- **Storm Web** (stat `web`): a chain records the enemies it struck and what it hit each for. When it ends, it leaves a `Web` in `world.webs`. The web zaps its own enemies `chain.webZaps` times over `chain.webSeconds` (each zap at `webShare` of that enemy's hit), refreshes Shock on every zap, and is drawn every frame between its living enemies.
- **Wandering Spark** (stat `spark`): the chain becomes a creeping chain with `chain.sparkHopSeconds` between hops, including the first one from his hands. Every enemy it kills gives it one more hop. It's drawn as a glowing orb travelling between enemies.

**Spec:** spellbook Version 12: Chain Lightning → Storm Web, Wandering Spark. Roadmap Phase 6.

## Global Constraints

- **Storm Web:**
  - The web lasts about 1 s: 3 zaps, each at 40% of that link's hit.
  - Only its own enemies are zapped. It's a web on the enemies, not a fence on the ground (Tier 1 leaves nothing behind).
  - It follows its enemies as they move, and a link breaks when either of its enemies dies.
  - Shock is refreshed on every zap. Crescendo: every zap keeps its link's position, so the last enemy takes the big hit every zap.
  - Overload creeps out and leaves a giant web behind. The branch is plain and doesn't linger. Static Discharge arcs don't linger.
- **Wandering Spark:**
  - A visible spark that travels from enemy to enemy, 0.12 s per hop.
  - Hops = its jumps (3, +1 per +1 Jump). It never hits the same enemy twice. With nothing in reach it fizzles out.
  - Kills feed it: every enemy it kills gives it one more hop.
  - Conduction: hops onto shocked enemies are free.
  - Crescendo grows every hop; the doubled hit comes on the hop it makes with no hops left (a kill on that hop still earns another).
  - Overload doubles its hops. The branch is a plain instant arc.
- Evolutions are exclusive and offered at level 20. Card lines ≤45 characters. The old build is unchanged. Workflow: commit, test, build, push, tag `step-33`.

## Review Focus

1. **A web whose enemies die mid-web** → its links to them break; the rest keep zapping; the web goes when its time's up.
2. **Webs piling up** (a web about every second, lasting about a second) → roughly one at a time; they're removed when done, never left forever.
3. **A spark whose next enemy dies while it's travelling** → it picks a new one from where it is, or fizzles cleanly.
4. **A spark in a weak crowd with kills feeding it** → it keeps hopping while it keeps killing; it stops when it runs out, never loops, never hits the same enemy twice.
5. **The spell switched off or the run restarted** with webs or sparks alive → nothing crashes; they finish or are cleared with the world.

## Starting numbers

- `config.chain`: `webSeconds` 1, `webZaps` 3, `webShare` 0.4, `sparkHopSeconds` 0.12.
- Upgrades: `up_cl_web` (`web` 1, card "The chain lingers as a crackling web"); `up_cl_spark` (`spark` 1, card "The chain becomes a bouncing spark"). Both evolutions, weight 400.

---

### Task 1: Storm Web

- [ ] **Failing tests:**
  - Offered at 20, and rules out Wandering Spark.
  - A 4-enemy chain: each enemy ends up with its hit × (1 + 3 × 0.4) over about 1.1 s, then `world.webs` is empty.
  - A web enemy killed mid-web: the others keep taking their zaps.
  - With Shock, a web enemy's shock is refreshed by the zaps (more than 2.5 s left at 0.9 s).
  - With Crescendo, the last enemy's zaps are 0.4 × 2.5 × base each.
  - With Overload, the creeping cast leaves a web once it's done.
- [ ] **Implement:**
  - `Chain.nodes` (each enemy struck and its hit) and `Chain.web`. When a chain ends, create the web.
  - `updateWebs` in `updateChains` (zap timer, removal).
  - Zaps count as continuous damage (`overTime`), with a spark sprite per zap, so they never strobe the white hit flash.
  - `drawWebs` in effects.ts: lifted lines between consecutive living nodes, fading over the web's life.
- [ ] Commit "Chain Lightning: Storm Web".

### Task 2: Wandering Spark

- [ ] **Failing tests:**
  - Offered at 20, and rules out Storm Web.
  - A 5-line: nothing is hit at the cast. The first enemy is hit after about 0.12 s, two by 0.3 s, four by 0.6 s, and the fifth never.
  - Kills feed: the first three enemies in a 6-line have 1 hp. The spark kills them and hops on, and all six are hit.
  - Never twice: two enemies, two hits.
  - It fizzles: one enemy, one hit, then `world.chains` is empty.
  - Its next enemy dying mid-travel: it goes on to another from where it is, or ends.
- [ ] **Implement:**
  - `spark` makes the chain creep at `sparkHopSeconds`, including the first hop, and marks it for drawing.
  - Kill feed in `hopOnce`: if the struck enemy dies, add a jump. If no next target was found yet, look again.
  - Crescendo's "last" is judged before the kill; a kill after it still earns a hop.
  - `drawSparks`: an orb moving from the chain's last point to its current enemy over the hop.
- [ ] Commit "Chain Lightning: Wandering Spark".

### Task 3: Check, review, ship

- [ ] `npx tsc --noEmit`, `npm test`. In the game: screenshot a web and a spark; no console errors.
- [ ] Fresh reviewer, then fixes.
- [ ] `npm run build`, commit "Step 33: Storm Web and Wandering Spark", tag `step-33`, push, check live.
