/**
 * The save file: everything that outlives a single run.
 *
 * Kept in the browser's localStorage, so it survives closing the tab but
 * belongs to one browser on one machine — and the local dev server and the
 * published page are different sites, so each has its own save.
 *
 * meta/ sits beside sim/ rather than inside it. The simulation never reads or
 * writes the save; it announces what happened (see sim/events.ts) and main.ts
 * passes that on. That keeps a run a pure function of its seed and the
 * player's choices, which is what the headless tests rely on.
 */

const STORAGE_KEY = 'idle-survivor.profile'

/**
 * Bumped whenever the shape changes in a way old saves can't be read as-is.
 * loadProfile is where an old version would be upgraded to the new one.
 */
const VERSION = 1

export interface Profile {
  /** Deposited at the shop across every run, not yet spent. */
  bankedGold: number
}

function freshProfile(): Profile {
  return { bankedGold: 0 }
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Read the save, or start a fresh one.
 *
 * Never throws. Storage can be blocked outright (some private windows), and a
 * save edited by hand or written by a future version can hold anything — in
 * every such case the game should still start, just without the history.
 */
export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshProfile()
    const data = JSON.parse(raw) as Record<string, unknown>
    return { bankedGold: nonNegative(data.bankedGold) }
  } catch (error) {
    console.warn('Could not read the save; starting a fresh one.', error)
    return freshProfile()
  }
}

/** Write the save. A failure costs the history, never the running game. */
export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...profile }))
  } catch (error) {
    console.warn('Could not write the save.', error)
  }
}
