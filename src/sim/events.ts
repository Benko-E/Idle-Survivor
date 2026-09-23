import { EventBus } from '../core/events'

/**
 * What the simulation announces, and the channel it announces it on.
 *
 * Add an entry here when a new feature needs to hear about something, and emit
 * it from the one place that thing happens. Nothing under sim/ ever listens —
 * the simulation only talks outward, so it runs identically with or without
 * anyone subscribed (which is how the headless tests run it).
 *
 * Module-level on purpose, unlike game state. Listeners are wiring, set up
 * once at startup, and they should survive a restart: the save file wants to
 * hear about banking in every run, not just the first one.
 */
export interface GameEvents extends Record<string, unknown> {
  /** He reached the shop and deposited what he was carrying. */
  banked: { amount: number }
  /** Contact damage finished him off. Carried gold dies with him. */
  died: { time: number; goldLost: number }
  /**
   * An enemy took damage. Fires for every hit and every tick of damage over
   * time, so it's frequent — the payload object is reused between emits and
   * must be copied, not kept.
   */
  enemyDamaged: { enemyId: number; x: number; y: number; amount: number; colour: string; killed: boolean }
}

export const gameEvents = new EventBus<GameEvents>()
