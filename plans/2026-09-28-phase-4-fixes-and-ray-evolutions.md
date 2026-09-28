# Phase 4: Playtest Fixes and the Ray's Evolutions — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (native). Checkbox steps. The user gave a standing go-ahead to run all remaining phases (plan → build → review → fixes → commit → push → tag) without check-ins.

**Goal:** The five playtest fixes from after step-30, then Ray of Frost's two exclusive level-20 evolutions: Glacial Sweep and Winding Ray.

**Architecture:**
- **Fixes:**
  - Pinwheel's spiral stretches the bolt's remaining life when it starts.
  - A new renderer method draws a line between two lifted points, so the beam leaves his hands and ends at an enemy's body, or at a flier's drawn height (`flightLift`, now exported).
  - Pierce keeps last tick's pierced enemies while they're still roughly behind the target: a looser strip for keeping than for picking up.
- **Evolutions:** `beams.ts` gets a mode per evolution, and each mode produces the touched list. Everything after that (damage, forks, push, Cold Snap, Frostbite, keeping frozen) stays shared.
  - **Glacial Sweep** (stat `sweep`): the beam swings through an arc and touches enemies on its line: the first, plus Pierce more. Frostbite counts passes instead of seconds.
  - **Winding Ray** (stat `winding`): it aims into the densest pack, through a corridor of the enemies in front, up to 3 + Pierce pass-throughs. The next enemy is its target. It's drawn as a smooth curve through them.

**Spec:** spellbook Version 12, Ray of Frost → Glacial Sweep, Winding Ray; roadmap "Playtest fixes waiting".

## Global Constraints

- Evolutions are exclusive and offered at level 20; card lines ≤45 characters.
- **The Ray's rules still hold in every form:** "touched" = everything the beam touches; frozen lasts while touched, then 2 s; forks are plain.
- **Glacial Sweep:** an arc, never a full circle.
- **Winding Ray:** a smooth curve, never jagged or jumping (that's lightning); 3 free pass-throughs, +1 per Pierce; falls back to a straight beam in a thin crowd.
- The old build is unchanged. Workflow: commit, test, build, push, tag `step-31`.

## Review Focus

1. **Pierce with a jostling crowd** → the pierced enemies stay the same while they're roughly behind the target, instead of flickering.
2. **Glacial Sweep with nothing in range** → it idles rather than sweeping at empty grass (no damage, no drawing).
3. **Glacial Sweep with Flash Freeze** → frozen enemies don't block the sweep; the unfrozen ones behind them are touched.
4. **Winding Ray in a thin crowd** (one enemy, or no real pack) → a straight beam at the nearest enemy.
5. **Winding Ray while the crowd moves** → its pass-through enemies don't flicker (same stickiness as Pierce).

## Rulings made while planning

- **Pinwheel's spiral lasts `combat.pinwheelSpiralLife` (2) times** the rest of the flight. The user asked for "at least doubled".
- **Heights:** the beam leaves him at `FLIGHT_HEIGHT` (16, hand height, where bolts fly). It ends 6 above a walker's feet, and at a flier's `flightLift` + 6.
- **Glacial Sweep:**
  - Arc 75°, one pass (one swing across) per second.
  - The arc re-centres on the nearest enemy at the end of each pass.
  - Frostbite adds `beam.sweepChill` (1 s of cold) each time the sweep starts crossing an enemy, and the cold drains at `beam.sweepFade` (0.2 a second) between passes. That's about 3 passes to freeze ("about 3 passes", spellbook).
- **Winding Ray:**
  - The "pack" is the enemy with the most neighbours within 90 (the existing `pickTargets` densest sample).
  - The corridor is 70 wide around the line from him to that enemy. Its enemies are sorted by distance along the line.
  - The first 3 + Pierce are passed through (frozen ones free with Flash Freeze) and the next is the target.
  - The target is held until it dies (or freezes, with Flash Freeze).
  - Thin crowd: a pack with fewer than 3 enemies around it means a straight beam at the nearest enemy.

---

### Task 1: Playtest fixes

- [ ] **Pinwheel:** failing test first. In the newFirebolt "missing everything" test, the end is now `0.6 + 0.4 × pinwheelSpiralLife` of the flight. Implement: `startSpiral` multiplies `projectile.life` by `combat.pinwheelSpiralLife`.
- [ ] **Stable Pierce:** failing test first.
  - Setup: target at 80; enemies on the line at 110, 140, 170; two more (at 125 and 155) bob in and out of the pick strip every 0.1 s, staying inside the keep strip.
  - With Pierce ×3, over 1 s the pierced set changes at most once.
  - Implement: `pierceBehind` first keeps last tick's pierced enemies that are alive, beyond the target within `pierceReach × 1.2`, and within `2 × width` + their radius of the line. Then it fills the remaining places from the pick strip as before, nearest first.
- [ ] **Heights (render):**
  - Renderer: `strokeLiftedLine(x1, y1, lift1, x2, y2, lift2, colour, width, alpha)`.
  - `enemyLooks.ts` exports `flightLift`.
  - `drawBeams` starts at `FLIGHT_HEIGHT` and ends each segment at the enemy's `flightLift + 6`. Forks go from the target's lift to their enemy's lift.
  - Check in the game with a screenshot (the render has no unit tests).
- [ ] Commit "Playtest fixes: longer Pinwheel spiral, beam heights, steady Pierce".

### Task 2: Glacial Sweep

- [ ] **Failing tests:**
  - Offered at 20, and rules out Winding Ray.
  - With enemies at −30°, 0° and +30° (distance 150), all three are damaged within 2.5 s. One at 90° (outside the arc) is not.
  - Two enemies in line at 0°, no Pierce: only the nearer is damaged. With Flash Freeze and the nearer one frozen, the farther one is damaged.
  - With Frostbite, an enemy on the arc freezes within about 3–5 passes (by 6 s).
  - Nothing in range: no damage and an empty path.
- [ ] **Implement:**
  - `sweep` stat. In sweep mode the state keeps `sweepCentre` (angle) and `sweepPhase`. The beam's angle is `centre + (arc/2) × sin(phase)`, and the phase advances by π each pass.
  - At each pass end (the phase crossing a multiple of π), re-centre on the nearest enemy in range.
  - With no enemy in range: idle.
  - Touched: enemies within `width` + their radius of the beam's line out to `range`, sorted along it. The first is touched, plus Pierce more, with Flash Freeze's free pass through frozen ones.
  - Frostbite in sweep mode: pass-based cold, as in the ruling.
  - Drawn from him to the last touched enemy, or to the end of its range if it touches nothing.
  - Upgrade `up_ray_sweep`: evolution, card "The beam sweeps back and forth", weight 400.
- [ ] Commit "Ray of Frost: Glacial Sweep".

### Task 3: Winding Ray

- [ ] **Failing tests:**
  - Offered at 20, and rules out Glacial Sweep.
  - Front enemies at about 60, 110 and 160 near the line, with a pack of 6 around (260, 0): the three front ones and one pack enemy are damaged, and the rest of the pack isn't.
  - With Pierce ×1, one more pack enemy is damaged.
  - A single enemy: a straight beam on it.
  - With Flash Freeze and a front enemy frozen, it reaches one deeper.
  - The pass-through set stays steady while the front enemies bob a little.
- [ ] **Implement:**
  - `winding` stat, winding mode.
  - The pack comes from `pickTargets(..., 'densest')`, using its neighbour count; thin crowd falls back.
  - The corridor has the same stickiness as Pierce: keep last tick's pass-throughs while they're within 1.5 × the corridor.
  - Target and hold as in the ruling.
  - `path` = pass-throughs, then the target.
  - Render: a smooth curve (one round of Chaikin corner-cutting) through him, each pass-through and the target, all lifted.
  - Upgrade `up_ray_winding`: evolution, card "The beam winds through the crowd", weight 400.
- [ ] Commit "Ray of Frost: Winding Ray".

### Task 4: Check, review, ship

- [ ] `npx tsc --noEmit`, `npm test`. In the game: screenshot a raised beam, a sweep and a winding beam; no console errors.
- [ ] Fresh reviewer, then fixes.
- [ ] `npm run build`, commit "Step 31: playtest fixes, Glacial Sweep, Winding Ray" with `docs/index.html`, tag `step-31`, push both, and check the live page.
