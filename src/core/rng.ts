/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * We never use Math.random(). A seeded generator means an identical run can be
 * replayed after a config change, which is the only way to tell whether the
 * movement AI actually got better or just got a luckier spawn pattern.
 */
export type Rng = () => number

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Random point inside a circle, evenly distributed by area. */
export function pointInCircle(rng: Rng, radius: number): { x: number; y: number } {
  const angle = rng() * Math.PI * 2
  const r = Math.sqrt(rng()) * radius
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}
