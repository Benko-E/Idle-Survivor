# New Build: Roadmap for the Three Tier 1 Starters

**Spec:** the Idle Survivor spellbook (https://claude.ai/artifact/AKfux2VDnpPyZe47TsCZ9J, Version 12): the Firebolt, Ray of Frost and Chain Lightning entries, "Generic upgrade ideas", and the Design rules.

The spells in the game today are **the old build**. The spellbook redesign is **the new build**. This document is the fresh look at the three designed starters from an implementation point of view: what already exists, what's new, how the old build steps aside, and the order to build it in. Each phase gets its own detailed plan when it starts (Phase 1's is written: `2026-09-28-phase-1-build-switch-and-firebolt.md`), and every phase ends the same way: `npm test` green, checked in the game, then **stop for the user's playtest** before the next phase.

---

## 1. How the old build steps aside

**Everything old is retired (user, 2026-09-28): every spell and every upgrade.** Only the systems stay. The new build offers new spells and new upgrades and nothing else, so after Phase 1 the menu has one card (the new Firebolt), there's no Tier 2 or 3 choice (empty tiers are already skipped), and level-ups only offer the new Firebolt's upgrades. It's fine that runs run out of things to pick after a few levels.

**Retired, not deleted.** Every old spell and every old upgrade gets `build: 'old'`. One config flag, `config.spells.oldBuild` (default `false`, in the debug panel), picks which roster the menu and the tier choices offer. The old build stays reachable at no cost, and more importantly, the existing tests (which are all about old spells) stay valid proof that the systems still work. It can be deleted outright later.
- **Old upgrades are offered only to a run that owns an old spell.** A new-build run never sees one: not Hardy, not Fleet Step, not "+30% fire damage". The new build will get its own general upgrades when those are designed.
- **An empty level-up hides the button.** Today a "Level up" button with nothing behind it would stay on screen and do nothing when clicked.

**New ids, new code alongside.** New spells get new ids: `spell_firebolt_01`, `spell_ray_of_frost_01`, `spell_chain_lightning_01`. Code for new mechanics is added alongside and switched on by new stats, so an old spell never sees it. The whole existing test suite must stay green in every phase; tests about the old roster switch themselves to the old build.

**The default starter becomes explicit.** Worlds created without a pick (tests, benches, the world behind the menu) currently take "the first tier 1 spell", which the switch would change. That becomes `config.character.defaultStarter` (the old Firebolt), so no existing test changes meaning.

---

## 2. The shared pieces

| Piece | What it is | First needed |
|---|---|---|
| **Build switch** | `build` on spells and upgrades, `config.spells.oldBuild`; old upgrades only for runs owning an old spell; an empty draft hides the button | Phase 1 |
| **Generic upgrade lists as templates** | `src/data/genericUpgrades.ts`: `boltUpgrades(spellId, prefix)`, later `beamUpgrades`, `chainUpgrades`. Each spell gets its own copies (its own ids and `spellId`), so two bolt spells never share a Pierce, and the draft's "a card for each of his spells" and level-12 breakpoint count them as that spell's cards without any draft changes | Phase 1 (bolts), 3 (beams), 5 (chains) |
| **"When an enemy hits him" reactions** | Backdraft exists (8 plain bolts, 4 s wait, never from his own damage). Cold Shoulder and Static Discharge are the same shape, so Phase 3 generalises Backdraft into `src/sim/reactions.ts` reading three stats | Phase 3 |
| **Heat colours** | Stoked red and white-hot as halos on the bolt, never a size change | Phase 1 |
| **Offering pass** | "Frostbite offered every level-up until picked" is a spellbook note for the later offering pass, **not** part of these phases | later |

---

## 3. The fresh look, spell by spell

### Firebolt (Phase 1: base, generic bolt list and mutations; Phase 2: evolutions)

Most of it exists. The `projectile` behaviour already has fork, return, pierce, ignite and backdraft, and plain bolts for forks and Backdraft.

| Part | Status |
|---|---|
| Pierce, Fork, Return | Exist. Data only |
| Heavy Bolt | Exists as stats (`boltSpeed`, `boltSize`, `boltDamage`). Data only |
| Accelerating Bolt | **New**: speed ramps 0.5× to 2× over the flight, damage follows (0.7× to 2.2×), keeps rising on the way back up to a cap |
| Split Shot | **New stat** `split`: extra bolts sharing the damage. Each carries every mutation; only the main bolt forks and returns. Split bolts take the next targets (Kindling's unburnt ones if he has it) and fan out only when there aren't enough |
| Ignite | Exists (40% of the hit over 3 s, refreshes, no stacking). Data only |
| Kindling | **New**: targets the nearest unburnt enemy that no bolt of his is already flying at |
| Hot Streak | **New semantics**: the old one pierces everything and grows. The new one is every 5th cast at 2× damage, white-hot, same size. A new stat (`whiteHot`), so the old one stays as it is |
| Stoked | **New**: +15% per enemy passed through, up to +120%, deep red, no size change |
| Backdraft | Exists exactly as designed. Data only |
| **Phase 2 must first decide: banked levels that can't be spent** | Found in Phase 1's review: once a run runs dry, each new level adds to both `level` and `pendingLevelUps`, so `draftLevel` stays frozen (about 17) and `evolutionLevel` 20 is never reached. Evolutions would never be offered to a run that ran dry. Options: evolution eligibility reads `world.level`; drop unspendable banked levels; or spend the backlog up to the newest level when offers reappear. Put it in Phase 2's Review Focus |
| Pinwheel (Phase 2) | **New flight mode**: straight to the first hit, which is free, then an outward spiral from that point. Same flight time; Pierce rules after that |
| Salvo (Phase 2) | **New cast mode**: bolts gather over his head, 5 at once. The stack counts bolts; a caught returning bolt adds half a charge |

### Ray of Frost (Phase 3: base, beam list and mutations; Phase 4: evolutions)

**Nothing like it exists yet.** It needs a new `beam` behaviour (`src/sim/beams.ts`), built like the orbit and body spells: it "casts" on a short tick (about 0.1 s) and keeps its own state.
- **The beam itself:** holds a target until it dies, deals `damage` per second, and publishes its path each tick (`world.beams`) for the renderer. The renderer draws it with the existing stretched-art line (`drawWorldBeam`).
- **Frostbite:** each enemy's "time touched" is kept on the beam. Chill grows with it and the enemy freezes at 3 s. It stays frozen while touched and for 2 s after (the existing `frozen` condition; refreshing it while touched already works). Chill fades over 2 s.
- **Flash Freeze:** frozen enemies don't hold the beam (retarget; frozen ones don't use up pass-throughs).
- **Winter's Breath:** a gentle push of 20 a second on everything touched, respecting terrain.
- **Cold Snap:** every 6 s, freeze everything touched.
- **Cold Shoulder:** a reaction (see above): 1.5 s freeze on enemies touching him, then 10 s.
- **Generic beam list:** Beam Pierce (continues through the target along the line), Beam Fork (a plain second beam), Beam Split (whether it shares damage is still undecided in the spellbook; ask at the start of Phase 3).
- **Glacial Sweep (Phase 4):** a 75° back-and-forth arc; Frostbite counts passes instead of seconds.
- **Winding Ray (Phase 4):** aims into the densest pack only as deep as 3 + Pierce pass-throughs reach, then draws a smooth curve through the chosen enemies.
- **One existing rule to know:** `frozen` makes an enemy immune for 2 s after it thaws, so a crowd can't be held forever. The Ray keeps that rule, so an enemy that just thawed can't be refrozen by Cold Snap for 2 s.

### Chain Lightning (Phase 5: base, chain list and mutations; Phase 6: evolutions)

The `chain` behaviour exists (instant, nearest-first, never the same enemy twice, falloff). New features are added as new stats, so the old one is untouched.
- **Shock:** the existing `shocked` condition (+20% from everything, strongest counts, a different source sits alongside) is exactly what's designed. Data plus one stat.
- **Conduction:** a jump onto a shocked enemy doesn't use up a jump.
- **Crescendo:** replaces the falloff with 0.5× first, +25% per jump, last hit doubled.
- **Overload:** every 5th cast has double jumps and **creeps**. That needs chains that travel over time instead of in one frame, so Phase 5 adds travelling chains (`src/sim/chains.ts`). That same piece is what Wandering Spark reuses.
- **Static Discharge:** a reaction: plain arcs into up to 6 enemies near him, then 5 s.
- **Generic chain list:** +1 Jump (`count`), Branching (a plain instant branch off the first jump).
- **Storm Web (Phase 6):** links kept on the world for about 1 s, zapping only their own enemies (3 × 40%) and following them.
- **Wandering Spark (Phase 6):** a travelling chain, 0.12 s per hop, +1 hop per kill.

---

## 4. Phases

Each phase ends with `npm test` green, a check in the game, and a stop for the user's playtest.

| Phase | Builds | Visible result |
|---|---|---|
| **1** | Build switch, everything old retired; new Firebolt with the generic bolt list and its 5 mutations | Menu: only the new Firebolt. Level-ups: only its cards, then none |
| **2** | Firebolt's evolutions: Pinwheel, Salvo | Level 20 with the new Firebolt |
| **3** | Beam behaviour, Ray of Frost, generic beam list, 5 mutations, reactions refactor | Ray of Frost joins the menu |
| **4** | Ray evolutions: Glacial Sweep, Winding Ray | |
| **5** | Chain upgrades, travelling chains, new Chain Lightning, 5 mutations | Chain Lightning joins the menu: all three starters |
| **6** | Chain evolutions: Storm Web, Wandering Spark | |
| **7** | Wrap-up: benches default to the new starters (`STARTERS`), icons for the new ids, README notes | |

Balance is **not** in these phases (it gets its own day). Numbers are the spellbook's starting numbers.

---

## Playtest fixes waiting (user, after step-30) — do these at the start of Phase 4

1. **Pinwheel's spiral lasts at least twice as long.** Today the spiral uses the rest of a normal bolt's flight. Give the spiral part at least double that (the whole flight gets longer; check the screen budget).
2. **The beam starts higher:** from his hands, not the ground. Draw it lifted (like bolts at `FLIGHT_HEIGHT`, around hand height).
3. **The beam ends slightly higher on enemies:** a little off the ground, at their body, not their feet.
4. **The beam ends higher still on flying enemies:** today it aims at their ground position; it should end at their drawn height (`render.flightHeight` plus the bob).
5. **With max Pierce, the pierced beams switch targets erratically** while the main beam stays on its target. Likely cause: Pierce re-picks, every tick, whichever enemies happen to be inside a narrow strip behind the target (`beam.width` 10 plus their size, up to `pierceReach` 140), so enemies drifting in and out of that strip swap constantly. Likely fix: keep the enemies it pierced last tick while they're still roughly behind the target (a looser strip for keeping than for picking up), and only fill empty places with new ones. Check with a test that the pierced set stays stable while enemies jostle.

## 5. Things the fresh look turned up, and the user's answers (2026-09-28)

1. **Split Shot's pick count:** 3 bolts at most, so **2 picks**. (The spellbook's Picks field saying 3 was a wording slip.)
2. **Frozen immunity:** keep the existing rule (no refreeze for 2 s after thawing); revisit if it's a problem.
3. **Backdraft's trigger** today is any damage that isn't his own, which includes enemy gas clouds and enemy bolts. Those are enemy-caused, so it matches "only hits from enemies". No change.
4. **Beam Split's damage sharing:** undecided; ask at the start of Phase 3, with an example.
5. **Old build:** retire everything, spells and upgrades; no borrowing. Runs may run out of picks after a few levels.
6. **Execution:** native (built in the main session, one reviewer at the end).
