/**
 * Seeded randomness for the genetic algorithm.
 *
 * Everything the evolution touches — scenario generation, tree mutation, the
 * dice a game rolls — draws from one of these, so a run is reproducible from
 * its seed alone. `resolveRound` already takes an injectable `Roll`, which is
 * what lets a whole tournament replay identically.
 */

/** A small, fast, deterministic generator. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [0, bound). Zero when `bound` is not positive. */
  int(bound: number): number
  /** Uniform integer in [min, max], inclusive both ends. */
  range(min: number, max: number): number
  /** True with probability `p`. */
  chance(p: number): boolean
  /** One item, uniformly. Throws on an empty list, which is always a bug here. */
  pick<T>(items: readonly T[]): T
  /** A fresh, independent generator, so nested work cannot disturb this stream. */
  fork(label: number): Rng
}

/** Mix a 32-bit seed so nearby seeds produce unrelated streams. */
function scramble(seed: number): number {
  let value = seed | 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return (value ^ (value >>> 15)) >>> 0
}

/** Mulberry32 — 32 bits of state, good enough for search and fully portable. */
export function makeRng(seed: number): Rng {
  let state = scramble(seed)

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: Rng = {
    next,
    int: (bound) => (bound > 0 ? Math.floor(next() * bound) : 0),
    range: (min, max) => min + rng.int(max - min + 1),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from an empty list')
      return items[rng.int(items.length)]
    },
    fork: (label) => makeRng(scramble(state ^ scramble(label + 1))),
  }

  return rng
}

/** Combine several numbers into one seed, for naming a game inside a run. */
export function seedFrom(...parts: number[]): number {
  let seed = 0x9e3779b9
  for (const part of parts) seed = scramble(seed ^ scramble(part))
  return seed
}

/** A d6 drawn from a seeded stream, for `resolveRound`. */
export function seededD6(rng: Rng): () => number {
  return () => rng.range(1, 6)
}
