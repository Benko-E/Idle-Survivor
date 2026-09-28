import type { UpgradeDef } from './types'
import { boltUpgrades } from './genericUpgrades'

/**
 * Everything the draft can offer that isn't a new spell. (spec 5.5)
 *
 * Every entry is pure data. There is no code for any individual upgrade
 * anywhere — taking one appends its modifiers to the world's list and the
 * resolver that has been sitting in the stat path since step 3 does the rest.
 *
 * Note what the tag selectors buy: "+30% damage" and "+30% damage to fire
 * spells" differ by one field. Adding "+2 chain jumps to lightning spells"
 * later is an entry here and nothing else.
 *
 * Each modifier's target must be a stat something actually reads — the spell
 * stats are listed on WeaponDef in types.ts, the character's in sim/stats.ts.
 * A target nothing reads is an upgrade that silently does nothing.
 *
 * Every entry below is the old build (`build: 'old'`), retired: offered only
 * to a run that owns an old spell. The new build's upgrades are marked by
 * their spellId instead (and its general ones will get `build: 'new'`).
 */
export const UPGRADE_DEFS: UpgradeDef[] = [
  // --- Offence: every spell --------------------------------------------------

  {
    id: 'up_damage_01',
    build: 'old',
    displayName: 'Focused Will',
    description: '+15% spell damage',
    tags: ['offence'],
    // Both stats, because damage over time is its own stat and the curse
    // reads only that one. With just 'damage' here, "+15% spell damage" did
    // nothing at all for Curse of Withering.
    modifiers: [
      { target: 'damage', op: 'increase', value: 0.15 },
      { target: 'dotDamage', op: 'increase', value: 0.15 },
    ],
    maxStacks: 6,
    weight: 100,
  },
  {
    // The id stays, so nothing that refers to it breaks. The name changed
    // because there's no casting to quicken — spells have no cast time, only
    // a recharge. It also used to shorten cooldowns by a flat percentage,
    // which adds up towards zero; see combat.ts for why it's a rate now.
    id: 'up_haste_01',
    build: 'old',
    displayName: 'Quickened Mind',
    description: 'Spells recharge 15% faster',
    details: 'A rate, not a percentage off: each pick helps, and none can make a spell free.',
    tags: ['offence'],
    modifiers: [{ target: 'cooldownRecovery', op: 'increase', value: 0.15 }],
    maxStacks: 5,
    weight: 90,
  },
  {
    id: 'up_range_01',
    build: 'old',
    displayName: 'Farsight',
    description: 'Spells find targets 20% further away',
    tags: ['offence'],
    // Spells that reach out: bolts, the first link of a chain, and how far
    // away a zone can be placed. Spells centred on him measure their reach in
    // `area` instead.
    modifiers: [{ target: 'range', op: 'increase', value: 0.2 }],
    maxStacks: 3,
    weight: 50,
  },

  // --- Offence: by kind of spell ---------------------------------------------

  {
    id: 'up_area_01',
    build: 'old',
    displayName: 'Widened Sigils',
    // Radius, which is what the number actually is. "+25% area of effect"
    // undersold it: a quarter more radius is over half as much again of area.
    description: 'Area spells reach 25% further',
    details: 'Radius, not area: a quarter further is over half as much ground again.',
    tags: ['offence', 'area'],
    modifiers: [{ target: 'area', op: 'increase', value: 0.25 }],
    maxStacks: 4,
    weight: 70,
    requiresOwnedTags: ['area'],
  },
  {
    id: 'up_pierce_01',
    build: 'old',
    displayName: 'Lancing Bolt',
    // Frost only, until frost gets its own upgrades: Firebolt has its own
    // Pierce now, and a generic one would have stacked on top of it.
    description: 'Frost bolts pass through 1 more enemy',
    details: 'Frost bolts carry on through one more enemy per pick. Frost only until frost gets upgrades of its own; Firebolt has its own Pierce.',
    tags: ['offence', 'projectile'],
    modifiers: [{ target: 'pierce', op: 'add', value: 1, tags: ['projectile', 'frost'] }],
    maxStacks: 3,
    weight: 50,
    requiresOwnedTags: ['projectile', 'frost'],
  },
  {
    id: 'up_chain_01',
    build: 'old',
    displayName: 'Forked Arc',
    description: '+1 chain jump',
    tags: ['offence', 'chain'],
    modifiers: [{ target: 'count', op: 'add', value: 1, tags: ['chain'] }],
    maxStacks: 3,
    weight: 55,
    requiresOwnedTags: ['chain'],
  },
  {
    id: 'up_conduct_01',
    build: 'old',
    displayName: 'Conduction',
    description: 'Chains lose less power with each jump',
    details: 'Each jump keeps more of the damage the last one did.',
    tags: ['offence', 'chain'],
    // The fraction kept per jump, 0.78 at base. Three stacks reach 0.96 — the
    // stack cap is what stops a chain ever gaining power as it goes.
    modifiers: [{ target: 'falloff', op: 'add', value: 0.06, tags: ['chain'] }],
    maxStacks: 3,
    weight: 45,
    requiresOwnedTags: ['chain'],
  },
  {
    id: 'up_chill_01',
    build: 'old',
    displayName: 'Permafrost',
    description: 'Chills slow 10% more and last 30% longer',
    details: 'Slowed enemies are never frozen solid by this alone: slows stop at 90%.',
    tags: ['offence', 'frost'],
    // Slow is a fraction of speed removed, added flat: 45% becomes 55%.
    // statusEffects caps the total at 90%, so nothing is ever frozen solid.
    modifiers: [
      { target: 'slow', op: 'add', value: 0.1, tags: ['frost'] },
      { target: 'duration', op: 'increase', value: 0.3, tags: ['frost'] },
    ],
    maxStacks: 3,
    weight: 50,
    requiresOwnedTags: ['frost'],
  },
  {
    id: 'up_wither_01',
    build: 'old',
    displayName: 'Deepening Rot',
    description: '+40% damage over time',
    tags: ['offence', 'curse'],
    modifiers: [{ target: 'dotDamage', op: 'increase', value: 0.4 }],
    maxStacks: 4,
    weight: 60,
    // Any spell that deals damage over time: the curse, Righteous Fire, the
    // vortex. It used to require the curse, back when that was the only one.
    requiresOwnedTags: ['dot'],
  },
  {
    id: 'up_strike_01',
    build: 'old',
    displayName: 'Gathering Storm',
    description: 'Storms strike 25% more often',
    tags: ['offence', 'lightning'],
    // It used to add a strike per cast, back when Thunderstorm was a volley.
    // Now the storm sits overhead, so it's how often lightning falls.
    modifiers: [{ target: 'strikeRate', op: 'increase', value: 0.25, tags: ['strike'] }],
    maxStacks: 3,
    weight: 50,
    requiresOwnedTags: ['strike'],
  },
  {
    id: 'up_root_01',
    build: 'old',
    displayName: 'Deep Roots',
    description: 'Roots hold enemies 30% longer',
    tags: ['offence', 'root'],
    modifiers: [{ target: 'root', op: 'increase', value: 0.3, tags: ['root'] }],
    maxStacks: 3,
    weight: 45,
    requiresOwnedTags: ['root'],
  },

  // --- Firebolt (new build) -------------------------------------------------------
  //
  // spell_firebolt_01: the generic bolt list, then its own mutations. The old
  // Firebolt's section below stays for the old build.

  ...boltUpgrades('spell_firebolt_01', 'up_firebolt'),
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
  {
    id: 'up_firebolt_pinwheel',
    spellId: 'spell_firebolt_01',
    kind: 'evolution',
    displayName: 'Pinwheel',
    description: 'After its first hit, the bolt spirals out',
    details: 'The bolt flies straight at its target as usual. After its first hit it spirals outward from that spot, sweeping through the crowd around it. Pierce decides how many more enemies it can pass through.',
    tags: ['offence', 'fire'],
    // The first hit is free and starts the spiral; same flight time as ever (combat.pinwheel*).
    modifiers: [{ target: 'pinwheel', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 400,
  },
  {
    id: 'up_firebolt_salvo',
    spellId: 'spell_firebolt_01',
    kind: 'evolution',
    displayName: 'Salvo',
    description: 'Bolts gather overhead, then fly out at once',
    details: 'Instead of flying out one by one, bolts gather above his head. When five are ready they all fly out at once, each at its own target.',
    tags: ['offence', 'fire'],
    // combat.salvoStack at once; the stack counts bolts; a caught returning bolt adds combat.salvoCatch.
    modifiers: [{ target: 'salvo', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 400,
  },

  // --- Firebolt ------------------------------------------------------------------
  //
  // Upgrades for one spell (spellId): offered only while he has Firebolt, and
  // touching nothing else, ever. The mechanics are bolt stats — fork, returns,
  // ignite, combustion, explode, flameTrail — read by the projectile
  // behaviour, so any bolt spell could be given them the same way.

  {
    id: 'up_fb_ignite',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Ignite',
    description: 'Hits set the target burning',
    details: "A share of each hit's damage is dealt again as burning over 3 seconds. Each pick burns hotter.",
    tags: ['offence', 'fire'],
    // A share of each hit's damage, dealt again as burning over igniteSeconds.
    modifiers: [{ target: 'ignite', op: 'add', value: 0.4 }],
    grantsTags: ['burning'],
    maxStacks: 3,
    weight: 60,
  },
  {
    id: 'up_fb_fork',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Fork',
    description: 'Hits throw a small bolt at another enemy',
    details: "After a hit, a smaller bolt flies off to another enemy nearby. Forks are plain bolts: half the damage, and none of Firebolt's other upgrades. Each pick adds a fork.",
    tags: ['offence', 'fire'],
    // Forks are plain bolts: half damage, no other upgrades on them.
    modifiers: [{ target: 'fork', op: 'add', value: 1 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_fb_pierce',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Pierce',
    description: 'Passes through 1 more enemy',
    details: 'Each pick lets Firebolt carry on through one more enemy. Should he take Phoenix Bolt later, which pierces everything, each Pierce he took makes its trail burn hotter instead.',
    tags: ['offence', 'fire'],
    modifiers: [
      { target: 'pierce', op: 'add', value: 1 },
      // Nothing until Phoenix Bolt, which pierces everything anyway: then
      // each pick taken before it makes its trail burn hotter instead.
      { target: 'flameTrail', op: 'increase', value: 0.25 },
    ],
    grantsTags: ['piercing'],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_fb_return',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Returning Bolt',
    description: 'The bolt comes back to him',
    details: "At the end of its flight, or when an enemy stops it, the bolt turns round and flies back to him, passing through everything on the way. Only the bolt itself returns; its forks don't.",
    tags: ['offence', 'fire'],
    // The main bolt only; forks never come back.
    modifiers: [{ target: 'returns', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 45,
  },
  {
    id: 'up_fb_combust',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Combustion',
    description: 'Hitting a burning enemy detonates it',
    details: "The rest of its burn goes off at once as an explosion, and any burning enemy caught in the blast goes off too, so it can chain through a crowd. Works on burns from any spell, Righteous Fire's included.",
    tags: ['offence', 'fire'],
    // Detonates burns from any source — Righteous Fire, Meteor — and any
    // burning enemy caught in the blast goes off too.
    modifiers: [{ target: 'combustion', op: 'add', value: 1 }],
    grantsTags: ['explosive'],
    requires: ['up_fb_ignite'],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_fb_hotstreak',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Hot Streak',
    description: 'Every 5th Firebolt is huge',
    details: 'Every fifth cast is a huge bolt that pierces everything and forks off every enemy it hits.',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'hotStreak', op: 'add', value: 5 }],
    requires: ['up_fb_pierce', 'up_fb_fork'],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_fb_backdraft',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Backdraft',
    description: 'When hurt, he fires a ring of bolts',
    details: 'Whenever he takes damage he fires 8 plain firebolts in every direction, then it needs 4 seconds to recharge.',
    tags: ['offence', 'fire'],
    // Plain bolts, with a cooldown of their own (combat.backdraftCooldown).
    modifiers: [{ target: 'backdraft', op: 'add', value: 8 }],
    maxStacks: 1,
    weight: 45,
  },
  {
    id: 'up_fb_fireball',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'evolution',
    displayName: 'Fireball',
    description: 'A slow, heavy fireball that explodes',
    details: 'Firebolt becomes a big, slow fireball that hits far harder and explodes on every hit. It keeps Pierce, Fork and Returning Bolt; its forks are plain firebolts.',
    tags: ['offence', 'fire'],
    // Keeps Pierce, Fork and Returning Bolt; its forks are plain firebolts.
    modifiers: [
      { target: 'boltSpeed', op: 'multiply', value: 0.42 },
      { target: 'boltDamage', op: 'multiply', value: 2.8 },
      { target: 'boltSize', op: 'multiply', value: 2 },
      { target: 'cooldown', op: 'multiply', value: 1.25 },
      { target: 'explode', op: 'add', value: 48 },
    ],
    grantsTags: ['explosive'],
    maxStacks: 1,
    weight: 400,
  },
  {
    id: 'up_fb_phoenix',
    build: 'old',
    spellId: 'spell_bolt_01',
    kind: 'evolution',
    displayName: 'Phoenix Bolt',
    description: 'Pierces everything, leaving fire behind',
    details: 'Firebolt passes through every enemy in its path and leaves a trail of burning ground. Each Pierce already taken makes the trail burn hotter.',
    tags: ['offence', 'fire'],
    // Pierce stops being offered; picks already taken heat the trail instead.
    modifiers: [
      { target: 'pierce', op: 'add', value: 99 },
      { target: 'flameTrail', op: 'add', value: 8 },
    ],
    grantsTags: ['piercing', 'burning'],
    retires: ['up_fb_pierce'],
    maxStacks: 1,
    weight: 400,
  },

  // --- Righteous Fire -----------------------------------------------------------
  //
  // Aura stats (sim/auras.ts), so any aura spell could be given the same.

  {
    id: 'up_rf_pyre',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: "Zealot's Pyre",
    description: 'A hotter aura that burns him too',
    details: "Each pick makes the aura burn far hotter, and burns him as well. The pyre goes out when he's badly hurt and lights again once he's back to full health.",
    tags: ['offence', 'fire'],
    // Each pick hotter both ways. Out below aura.pyreOffAt, relit at pyreOnAt.
    modifiers: [
      { target: 'pyreDamage', op: 'add', value: 0.6 },
      { target: 'selfBurn', op: 'add', value: 2 },
    ],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_cling',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Clinging Flames',
    description: 'Burns linger after leaving the aura',
    details: 'Enemies that step out of the aura keep burning for 1.5 seconds longer per pick.',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'duration', op: 'add', value: 1.5 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_feed',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Feed the Flames',
    description: 'Kills in the aura make it grow',
    details: 'Each kill inside the aura makes it a little bigger for a few seconds, up to a limit. Each pick grows it more.',
    tags: ['offence', 'fire'],
    // A share of radius per kill, for aura.feedSeconds each, up to its caps.
    modifiers: [{ target: 'feed', op: 'add', value: 0.05 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_beacon',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Beacon',
    description: 'Enemies in the aura take more fire damage',
    details: 'Enemies inside the aura take 15% more damage per pick from all his fire spells, the aura included.',
    tags: ['offence', 'fire'],
    // From every fire spell, the aura itself included.
    modifiers: [{ target: 'beacon', op: 'add', value: 0.15 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_consume',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Consuming Flames',
    description: 'Kills in the aura heal him',
    details: 'Enemies that die inside the aura heal him a little. The healing makes crowds safer, so he lets them closer: each pick makes him keep them in the aura more eagerly.',
    tags: ['defence', 'fire'],
    // The healing is what makes crowding safe, so he leans into it harder:
    // his pull towards keeping them in the aura grows with each pick.
    modifiers: [
      { target: 'consume', op: 'add', value: 1 },
      { target: 'engage', op: 'add', value: 0.5 },
    ],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_fervour',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: "Martyr's Fervour",
    description: 'The lower his health, the hotter it burns',
    details: "The aura burns hotter the more he's hurt: +70% at 30% health, up to double with none left.",
    tags: ['offence', 'fire'],
    // +100% at no health, so +70% at 30%.
    modifiers: [{ target: 'fervour', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 50,
  },
  {
    id: 'up_rf_crown',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'evolution',
    displayName: 'Crown of Flames',
    description: 'A tight crown of ferocious fire',
    details: 'The aura shrinks to half its size and burns five times as hot. Area upgrades still grow it.',
    tags: ['offence', 'fire'],
    // Area upgrades still grow it. Half size: at 30% it was barely wider than
    // him, and a percentage of that tiny ring hardly showed.
    modifiers: [
      { target: 'area', op: 'multiply', value: 0.5 },
      { target: 'dotDamage', op: 'multiply', value: 5 },
    ],
    maxStacks: 1,
    weight: 400,
  },
  {
    id: 'up_rf_zealotry',
    build: 'old',
    spellId: 'spell_aura_01',
    kind: 'evolution',
    displayName: 'Zealotry',
    description: 'Enemies catch Righteous Fire',
    details: "Enemies in the aura catch a little Righteous Fire of their own. It burns them, the enemies around them, and him if he's close.",
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'zealotry', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 400,
  },

  // --- Firewall -------------------------------------------------------------------
  //
  // Wall stats (sim/walls.ts), so any wall spell could be given the same.

  {
    id: 'up_fw_coals',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Hot Coals',
    description: 'Enemies keep burning after crossing',
    details: 'Enemies that walk through the wall keep burning for a while after. Each pick burns hotter.',
    tags: ['offence', 'fire'],
    // Each pick a hotter burn: a share of the wall's own, for wall.coalsSeconds after.
    modifiers: [{ target: 'coals', op: 'add', value: 0.5 }],
    grantsTags: ['burning'],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_fw_embers',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Wall of Embers',
    description: 'The wall spits embers',
    details: 'Each wall throws embers at enemies near it, 1.5 a second per pick.',
    tags: ['offence', 'fire'],
    // Embers a second, per wall.
    modifiers: [{ target: 'embers', op: 'add', value: 1.5 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_fw_kiln',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Kiln',
    description: 'Bolts come out of the wall stronger',
    details: "Any bolt of his that flies through a wall comes out 50% stronger and sets what it hits burning: Firebolt, its forks and returns, Frostbolt too. Once per bolt, and the burn counts as Firewall's.",
    tags: ['offence', 'fire'],
    // Every bolt of his, whichever spell: forks, returns, Frostbolt too. Once per bolt.
    modifiers: [{ target: 'kiln', op: 'add', value: 0.5 }],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_fw_hungry',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Hungry Flames',
    description: 'Kills keep the wall burning',
    details: 'Every enemy that dies in a wall keeps it burning a second longer, up to its full duration again. It lasts only while it keeps killing.',
    tags: ['offence', 'fire'],
    // Up to its full duration again, so it only lasts while it keeps killing.
    modifiers: [{ target: 'hungry', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_fw_lane',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Kiting Lane',
    description: 'Walls go down along his escape',
    details: 'He lays the wall behind him, out through the crowd chasing him, so whatever follows him runs the length of the fire.',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'lane', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 50,
  },
  {
    id: 'up_fw_dancer',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'mutation',
    displayName: 'Wall Dancer',
    description: 'He keeps walls between him and the crowd',
    details: 'He moves so his walls stay between him and the crowd, so they have to come through the fire to reach him. This one changes how he moves.',
    tags: ['offence', 'fire'],
    // How much his movement cares about the far side of his walls (sim/engagement.ts).
    modifiers: [{ target: 'engage', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 50,
  },
  {
    id: 'up_fw_ring',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'evolution',
    displayName: 'Burning Ring',
    description: 'The wall becomes a ring of fire',
    details: 'The wall closes into a great ring of fire around the crowd. The ring burns, not the inside: anything that crosses it catches fire. A ring has no lane to lay, so Kiting Lane goes.',
    tags: ['offence', 'fire'],
    // The ring is the fire, not what's inside it. A ring has no lane to lay.
    modifiers: [{ target: 'ring', op: 'add', value: 1 }],
    retires: ['up_fw_lane'],
    maxStacks: 1,
    weight: 400,
  },
  {
    id: 'up_fw_creep',
    build: 'old',
    spellId: 'spell_wall_01',
    kind: 'evolution',
    displayName: 'Creeping Blaze',
    description: 'The wall creeps towards enemies',
    details: 'The wall creeps towards the enemies like a grass fire, growing longer as it goes.',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'creep', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 400,
  },

  // --- Offence: by element ----------------------------------------------------

  {
    id: 'up_fire_01',
    build: 'old',
    displayName: 'Kindled Fury',
    description: '+30% damage with fire spells',
    tags: ['offence', 'fire'],
    // Both stats, so burns count as fire: Righteous Fire deals only dotDamage.
    modifiers: [
      { target: 'damage', op: 'increase', value: 0.3, tags: ['fire'] },
      { target: 'dotDamage', op: 'increase', value: 0.3, tags: ['fire'] },
    ],
    maxStacks: 4,
    weight: 60,
    requiresOwnedTags: ['fire'],
  },
  {
    id: 'up_frost_01',
    build: 'old',
    displayName: "Winter's Bite",
    description: '+30% damage with frost spells',
    tags: ['offence', 'frost'],
    modifiers: [
      { target: 'damage', op: 'increase', value: 0.3, tags: ['frost'] },
      { target: 'dotDamage', op: 'increase', value: 0.3, tags: ['frost'] },
    ],
    maxStacks: 4,
    weight: 60,
    requiresOwnedTags: ['frost'],
  },
  {
    id: 'up_storm_01',
    build: 'old',
    displayName: 'Static Charge',
    description: '+30% damage with lightning spells',
    tags: ['offence', 'lightning'],
    modifiers: [
      { target: 'damage', op: 'increase', value: 0.3, tags: ['lightning'] },
      { target: 'dotDamage', op: 'increase', value: 0.3, tags: ['lightning'] },
    ],
    maxStacks: 4,
    weight: 60,
    requiresOwnedTags: ['lightning'],
  },

  // --- Defence ----------------------------------------------------------------

  {
    id: 'up_vigour_01',
    build: 'old',
    displayName: 'Hardy',
    description: '+20 maximum health',
    tags: ['defence'],
    modifiers: [{ target: 'maxHp', op: 'add', value: 20 }],
    maxStacks: 5,
    weight: 70,
  },
  {
    id: 'up_regen_01',
    build: 'old',
    displayName: 'Second Wind',
    description: 'Regenerate 1 health per second',
    tags: ['defence'],
    modifiers: [{ target: 'hpRegen', op: 'add', value: 1 }],
    maxStacks: 3,
    weight: 60,
  },
  {
    id: 'up_ward_01',
    build: 'old',
    displayName: 'Warding',
    description: 'Take 10% less damage',
    details: 'Picks multiply rather than add up: four leave him taking 66% of the damage, and nothing makes him untouchable.',
    tags: ['defence'],
    // Multiply rather than increase, so picks compound: four leave him taking
    // 66%. Pooled as a percentage, ten would have made him invulnerable.
    modifiers: [{ target: 'damageTaken', op: 'multiply', value: 0.9 }],
    maxStacks: 4,
    weight: 55,
  },

  // --- Utility ----------------------------------------------------------------

  {
    id: 'up_reach_01',
    build: 'old',
    displayName: "Miser's Instinct",
    description: '+45% pickup radius',
    tags: ['utility'],
    modifiers: [{ target: 'pickupRadius', op: 'increase', value: 0.45 }],
    maxStacks: 3,
    weight: 75,
  },
  {
    id: 'up_swift_01',
    build: 'old',
    displayName: 'Fleet Step',
    description: '+8% movement speed',
    tags: ['utility'],
    modifiers: [{ target: 'moveSpeed', op: 'increase', value: 0.08 }],
    maxStacks: 4,
    weight: 70,
  },
  {
    id: 'up_scholar_01',
    build: 'old',
    displayName: 'Keen Study',
    description: '+20% experience gained',
    tags: ['utility'],
    modifiers: [{ target: 'xpGain', op: 'increase', value: 0.2 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_greed_01',
    build: 'old',
    displayName: 'Gilded Touch',
    description: '+25% gold found',
    tags: ['utility'],
    modifiers: [{ target: 'goldGain', op: 'increase', value: 0.25 }],
    maxStacks: 3,
    weight: 55,
  },
]
