import type { UpgradeDef } from './types'

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
 */
export const UPGRADE_DEFS: UpgradeDef[] = [
  // --- Offence: every spell --------------------------------------------------

  {
    id: 'up_damage_01',
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
    displayName: 'Quickened Mind',
    description: 'Spells recharge 15% faster',
    tags: ['offence'],
    modifiers: [{ target: 'cooldownRecovery', op: 'increase', value: 0.15 }],
    maxStacks: 5,
    weight: 90,
  },
  {
    id: 'up_range_01',
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
    displayName: 'Widened Sigils',
    // Radius, which is what the number actually is. "+25% area of effect"
    // undersold it: a quarter more radius is over half as much again of area.
    description: 'Area spells reach 25% further',
    tags: ['offence', 'area'],
    modifiers: [{ target: 'area', op: 'increase', value: 0.25 }],
    maxStacks: 4,
    weight: 70,
    requiresOwnedTags: ['area'],
  },
  {
    id: 'up_pierce_01',
    displayName: 'Lancing Bolt',
    // Frost only, until frost gets its own upgrades: Firebolt has its own
    // Pierce now, and a generic one would have stacked on top of it.
    description: 'Frost bolts pass through 1 more enemy',
    tags: ['offence', 'projectile'],
    modifiers: [{ target: 'pierce', op: 'add', value: 1, tags: ['projectile', 'frost'] }],
    maxStacks: 3,
    weight: 50,
    requiresOwnedTags: ['projectile', 'frost'],
  },
  {
    id: 'up_chain_01',
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
    displayName: 'Conduction',
    description: 'Chains lose less power with each jump',
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
    displayName: 'Permafrost',
    description: 'Chills slow 10% more and last 30% longer',
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
    displayName: 'Deep Roots',
    description: 'Roots hold enemies 30% longer',
    tags: ['offence', 'root'],
    modifiers: [{ target: 'root', op: 'increase', value: 0.3, tags: ['root'] }],
    maxStacks: 3,
    weight: 45,
    requiresOwnedTags: ['root'],
  },

  // --- Firebolt ------------------------------------------------------------------
  //
  // Upgrades for one spell (spellId): offered only while he has Firebolt, and
  // touching nothing else, ever. The mechanics are bolt stats — fork, returns,
  // ignite, combustion, explode, flameTrail — read by the projectile
  // behaviour, so any bolt spell could be given them the same way.

  {
    id: 'up_fb_ignite',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Ignite',
    description: 'Hits leave the target burning. More picks, hotter burns',
    tags: ['offence', 'fire'],
    // A share of each hit's damage, dealt again as burning over igniteSeconds.
    modifiers: [{ target: 'ignite', op: 'add', value: 0.4 }],
    grantsTags: ['burning'],
    maxStacks: 3,
    weight: 60,
  },
  {
    id: 'up_fb_fork',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Fork',
    description: 'After a hit, a smaller bolt seeks out another enemy nearby',
    tags: ['offence', 'fire'],
    // Forks are plain bolts: half damage, no other upgrades on them.
    modifiers: [{ target: 'fork', op: 'add', value: 1 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_fb_pierce',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Pierce',
    description: 'Firebolt passes through 1 more enemy',
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
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Returning Bolt',
    description: 'The bolt flies out and comes back to him, hitting everything twice',
    tags: ['offence', 'fire'],
    // The main bolt only; forks never come back.
    modifiers: [{ target: 'returns', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 45,
  },
  {
    id: 'up_fb_combust',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Combustion',
    description: 'Hitting a burning enemy sets its burn off at once, in an explosion that can chain',
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
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Hot Streak',
    description: 'Every 5th Firebolt is huge: it pierces everything and forks off every enemy it hits',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'hotStreak', op: 'add', value: 5 }],
    requires: ['up_fb_pierce', 'up_fb_fork'],
    maxStacks: 1,
    weight: 55,
  },
  {
    id: 'up_fb_backdraft',
    spellId: 'spell_bolt_01',
    kind: 'mutation',
    displayName: 'Backdraft',
    description: 'When he is hurt, he fires a ring of firebolts in every direction',
    tags: ['offence', 'fire'],
    // Plain bolts, with a cooldown of their own (combat.backdraftCooldown).
    modifiers: [{ target: 'backdraft', op: 'add', value: 8 }],
    maxStacks: 1,
    weight: 45,
  },
  {
    id: 'up_fb_fireball',
    spellId: 'spell_bolt_01',
    kind: 'evolution',
    displayName: 'Fireball',
    description: 'Firebolt becomes a slow, heavy fireball that explodes on every hit',
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
    spellId: 'spell_bolt_01',
    kind: 'evolution',
    displayName: 'Phoenix Bolt',
    description: 'Firebolt pierces everything and leaves a trail of burning ground',
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
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: "Zealot's Pyre",
    description: 'The aura burns far hotter, and burns him too. It goes out when he is badly hurt',
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
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Clinging Flames',
    description: 'Enemies that leave the aura keep burning for longer',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'duration', op: 'add', value: 1.5 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_feed',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Feed the Flames',
    description: 'Each kill inside the aura makes it grow for a while',
    tags: ['offence', 'fire'],
    // A share of radius per kill, for aura.feedSeconds each, up to its caps.
    modifiers: [{ target: 'feed', op: 'add', value: 0.05 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_beacon',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Beacon',
    description: 'Enemies inside the aura take 15% more fire damage',
    tags: ['offence', 'fire'],
    // From every fire spell, the aura itself included.
    modifiers: [{ target: 'beacon', op: 'add', value: 0.15 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_rf_consume',
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: 'Consuming Flames',
    description: 'Enemies that die inside the aura heal him a little, and he dares let them closer',
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
    spellId: 'spell_aura_01',
    kind: 'mutation',
    displayName: "Martyr's Fervour",
    description: 'The lower his health, the hotter the aura burns',
    tags: ['offence', 'fire'],
    // +100% at no health, so +70% at 30%.
    modifiers: [{ target: 'fervour', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 50,
  },
  {
    id: 'up_rf_crown',
    spellId: 'spell_aura_01',
    kind: 'evolution',
    displayName: 'Crown of Flames',
    description: 'The aura shrinks to a tight crown of fire that burns ferociously',
    tags: ['offence', 'fire'],
    // Area upgrades still grow it.
    modifiers: [
      { target: 'area', op: 'multiply', value: 0.3 },
      { target: 'dotDamage', op: 'multiply', value: 5 },
    ],
    maxStacks: 1,
    weight: 400,
  },
  {
    id: 'up_rf_zealotry',
    spellId: 'spell_aura_01',
    kind: 'evolution',
    displayName: 'Zealotry',
    description: 'Enemies in the aura catch a little Righteous Fire of their own, burning themselves, their neighbours, and him',
    tags: ['offence', 'fire'],
    modifiers: [{ target: 'zealotry', op: 'add', value: 1 }],
    maxStacks: 1,
    weight: 400,
  },

  // --- Offence: by element ----------------------------------------------------

  {
    id: 'up_fire_01',
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
    displayName: 'Hardy',
    description: '+20 maximum health',
    tags: ['defence'],
    modifiers: [{ target: 'maxHp', op: 'add', value: 20 }],
    maxStacks: 5,
    weight: 70,
  },
  {
    id: 'up_regen_01',
    displayName: 'Second Wind',
    description: 'Regenerate 1 health per second',
    tags: ['defence'],
    modifiers: [{ target: 'hpRegen', op: 'add', value: 1 }],
    maxStacks: 3,
    weight: 60,
  },
  {
    id: 'up_ward_01',
    displayName: 'Warding',
    description: 'Take 10% less damage',
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
    displayName: "Miser's Instinct",
    description: '+45% pickup radius',
    tags: ['utility'],
    modifiers: [{ target: 'pickupRadius', op: 'increase', value: 0.45 }],
    maxStacks: 3,
    weight: 75,
  },
  {
    id: 'up_swift_01',
    displayName: 'Fleet Step',
    description: '+8% movement speed',
    tags: ['utility'],
    modifiers: [{ target: 'moveSpeed', op: 'increase', value: 0.08 }],
    maxStacks: 4,
    weight: 70,
  },
  {
    id: 'up_scholar_01',
    displayName: 'Keen Study',
    description: '+20% experience gained',
    tags: ['utility'],
    modifiers: [{ target: 'xpGain', op: 'increase', value: 0.2 }],
    maxStacks: 3,
    weight: 55,
  },
  {
    id: 'up_greed_01',
    displayName: 'Gilded Touch',
    description: '+25% gold found',
    tags: ['utility'],
    modifiers: [{ target: 'goldGain', op: 'increase', value: 0.25 }],
    maxStacks: 3,
    weight: 55,
  },
]
