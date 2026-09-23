/**
 * What the wizard thinks, and when. (spec 5.1: content is data)
 *
 * Each moment has a pool of lines, one picked at random; a `chance` that he
 * says anything at all when it happens; and a `cooldown` before that moment
 * can make him think again. On top of those, any two thoughts are kept apart
 * by `thoughts.minGapSeconds` in the config — `urgent` moments get a much
 * shorter gap, because a new spell deserves a reaction even if he just spoke.
 *
 * Add a line anywhere; add a moment by giving it an entry here and a trigger
 * in ui/thoughts.ts.
 */
export interface ThoughtMoment {
  lines: string[]
  /** 0 to 1: how often the moment gets a thought at all. */
  chance: number
  /** Seconds before this moment can prompt a thought again. */
  cooldown: number
  urgent?: boolean
}

export const THOUGHTS: Record<string, ThoughtMoment> = {
  runStart: {
    chance: 1,
    cooldown: 0,
    lines: [
      'Right. Another fine day for wizardry.',
      'Staff? Check. Robe? Check. Dignity? Mostly.',
      "Let's see what the woods have for me today.",
      'I have a good feeling about this one.',
      'Deep breath. Nobody panic. Especially me.',
    ],
  },
  levelUp: {
    chance: 0.35,
    cooldown: 20,
    lines: [
      'I feel smarter already.',
      'Level up! Mother would be proud.',
      'Ooh, that tingles.',
      'Power! Unlimited-ish power!',
      'I should write this down.',
    ],
  },
  upgrade: {
    chance: 0.45,
    cooldown: 12,
    lines: [
      "Ahh, that's a big upgrade!",
      "Now THAT's what I call studying.",
      'Oh, I like that one.',
      'My spellbook just got heavier.',
      'Noted. Filed. Memorised.',
    ],
  },
  newSpell: {
    chance: 1,
    cooldown: 0,
    urgent: true,
    lines: [
      "A new spell! Let's take it for a spin.",
      'Ooh, a fresh page in the spellbook.',
      "I've been practising this one.",
      "Stand back, I've read the instructions!",
    ],
  },
  bonusPure: {
    chance: 1,
    cooldown: 0,
    urgent: true,
    lines: ['It all fits together now!', 'Harmony. Terrible, destructive harmony.', 'One element to rule them all.'],
  },
  bonusPrismatic: {
    chance: 1,
    cooldown: 0,
    urgent: true,
    lines: ['Fire, ice AND lightning? Why not all three!', 'A little bit of everything. Delicious.', 'Balance in all things. Mostly explosions.'],
  },
  goingToBank: {
    chance: 0.6,
    cooldown: 30,
    lines: [
      'Hmm, maybe I should go to the shop now.',
      'Pockets are getting heavy... to the shop!',
      "That's enough gold to be nervous about.",
      'Better bank this before something eats me.',
      'Shopping trip!',
    ],
  },
  banked: {
    chance: 0.5,
    cooldown: 30,
    lines: ['Safe and sound.', 'Ka-ching!', 'Every coin counts.', 'Right, back to work.', 'Nice doing business with you.'],
  },
  lowHealth: {
    chance: 0.8,
    cooldown: 25,
    urgent: true,
    lines: [
      'Ow. Ow ow ow.',
      'This is fine. Everything is fine.',
      'Note to self: fewer crabs.',
      "I'd like to lodge a complaint.",
      'Maybe running is a spell too?',
    ],
  },
  closeCall: {
    chance: 0.8,
    cooldown: 40,
    lines: ['Phew. That was too close.', 'Not today, crabs. Not today.', 'I meant to do that.', "My heart can't take much more of this."],
  },
  bigLoot: {
    chance: 0.4,
    cooldown: 25,
    lines: ['Ooh, shiny!', 'Is that... a whole purse?', 'Gold! Glorious gold!', "Don't mind if I do."],
  },
  crowd: {
    chance: 0.5,
    cooldown: 45,
    lines: [
      "That's... a lot of crabs.",
      'Why do they always come in hundreds?',
      'Personal space, please!',
      "I'm going to need a bigger spell.",
    ],
  },
  idle: {
    chance: 1,
    cooldown: 0,
    lines: [
      'I wonder what crabs think about.',
      'Nice weather for it.',
      'Should have been a baker.',
      'Do trees count as friends?',
      'Hum de dum...',
      'Is it lunchtime yet?',
      'I really should tidy my spellbook.',
      'Left foot, right foot, fireball.',
    ],
  },
  died: {
    chance: 1,
    cooldown: 0,
    urgent: true,
    lines: ['Well... that could have gone better.', 'Tell my spellbook I loved it.', "I'll be back. Probably.", 'Next time, fewer crabs.'],
  },
}
