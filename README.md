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

- [x] **0 — skeleton.** Loop, camera, Y-sorted rendering, endless world.
- [ ] 1 — enemies and spawning
- [ ] 2 — the danger map and movement AI
- [ ] 3 — weapons and combat
- [ ] 4 — XP pickups
- [ ] 5 — levelling
- [ ] 6 — the upgrade draft
- [ ] 7 — tuning panel
