# Idle Survivor

A survivors-like where **you don't control the character**. He walks, dodges and
fights on his own. Your only input is picking upgrades when he levels up.

Play it: https://benko-e.github.io/Idle-Survivor/

## Running it locally

**The easy way:** double-click the `Idle Survivor (dev)` shortcut on the desktop.
A minimised window appears in the taskbar (that's the server — close it to stop)
and the game opens in your browser. Edits appear on refresh.

**The other way**, from a terminal in this folder:

```bash
npm install
npm run dev
```

## Making a copy you can send someone

```bash
npm run build
```

This produces `dist/index.html` — a single self-contained file with all the code
inside it. Double-click it to play, or send it to someone and it works on their
machine with nothing installed. The same file is what gets published to the link
above, automatically, on every push to `main`.

## Debug keys

| Key | What it shows |
| --- | --- |
| `F1` | Stats panel |
| `F2` | The influence map as a heatmap — green attracts, red repels |
| `F3` | The fan of candidate directions, with the chosen one in yellow |
| `R` | Restart the run |

Runs use a fixed seed, so the same run repeats exactly. Change one weight in
`config.ts` and the survival time is a real before/after measurement.

`world()` in the browser console returns live game state, which is usually
faster than squinting at the screen:

```js
world().weapons.map(w => [w.def.displayName, w.timesCast])
```

## Known: he settles into small circles late in a run

He roams well early and then, once the horde has closed around him, orbits a
small area killing what comes until he's overwhelmed. Measured: over 15 seconds
he travels ~1600 units and ends ~100 from where he started.

It is not a bug in his reasoning, and three plausible fixes have been measured
and ruled out:

- **Longer sight.** The 24 candidate directions are straight-line samples, not
  vision. A longer ray toward a distant target still averages in the horde
  sitting between. Straight rays cannot represent going *around* something.
- **A staleness penalty on ground he's already walked.** Built, and it doesn't
  work: penalising his path pushes him perpendicular to it, and inward is safe
  and empty while outward is the horde, so it tightens the loop instead of
  breaking it. 0.55 and 1.5 both left roam efficiency at 0.06–0.09.
- **Turning weights up in general.** The field isn't mistuned.

The actual cause is two things at once, confirmed by instrumenting a live run:

1. He is genuinely encircled — at 2:31, all twelve 30° sectors around him had
   enemies within 500 units. There are thin sectors, but no clear one.
2. **There is nothing outside the ring that he wants.** Globes drop where
   enemies die, enemies die where he is, so all the value in the world is
   underneath him. Breaking out means crossing damage to reach empty ground.

Staying is therefore the correct answer to the field as it stands. Fixing it
means changing the field, not the tuning — either a diffusion pass so value
flows *around* danger and reveals a route through a thin sector, or a
long-range attractor that gives him somewhere to actually be.

## How this is put together

The architecture matters more than the content here — nearly everything will be
replaced as the game grows, so the goal is that adding things never means
restructuring things.

```
src/
  config.ts     every system-level tuning number, in one object
  core/         engine plumbing that knows nothing about this game
  data/         weapons, enemies, upgrades — content as data, not code
  sim/          the simulation. never imports from render/ or ui/
  render/       all drawing. swappable without touching the simulation
  ui/           menus and the level-up draft
```

Four rules that everything else follows from:

- **Content is data.** The engine knows a weapon has a fire rate and a
  behaviour. It must never know that a *specific* weapon exists. Adding a
  weapon means adding a data entry.
- **IDs are never display names.** `weapon_starter_01` is the identifier;
  `displayName` is what you read on screen. Renaming a sword to a fireball is a
  one-word change.
- **Anything that scales is a formula.** XP curves, enemy HP, spawn rates. Never
  a hardcoded table.
- **Upgrades are modifiers.** `{ target: "fireRate", op: "multiply", value: 1.15 }`
  goes through one generic system. No bespoke code per upgrade.

## Build status

Built one system at a time.

Each step is tagged, so `git checkout step-2` gets you exactly that state back.

- [x] **0 — skeleton.** Loop, camera, Y-sorted rendering, endless world.
- [x] **1 — enemies.** Travelling spawn ring, difficulty formulas, crowd separation.
- [x] **2 — the danger map.** Influence layers, steering, contact damage, death.
- [x] **3 — spells.** Behaviour registry, modifier system, status effects, kills.
- [x] **4 — XP drops.** Per-mob drop tables, globe tiers, two-layer pickup pull.
- [ ] 5 — levelling
- [ ] 6 — the upgrade draft
- [ ] 7 — tuning panel
