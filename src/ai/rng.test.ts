import { describe, expect, it } from 'vitest'
import { makeRng, seedFrom, seededD6 } from './rng'

function take(seed: number, count: number): number[] {
  const rng = makeRng(seed)
  return Array.from({ length: count }, () => rng.next())
}

describe('makeRng', () => {
  it('replays the same stream from the same seed', () => {
    expect(take(42, 8)).toEqual(take(42, 8))
  })

  it('gives unrelated streams to neighbouring seeds', () => {
    expect(take(1, 8)).not.toEqual(take(2, 8))
  })

  it('draws in [0, 1)', () => {
    for (const value of take(3, 500)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('keeps int inside the bound and range inside both ends', () => {
    const rng = makeRng(9)
    for (let i = 0; i < 500; i += 1) {
      const int = rng.int(5)
      expect(int).toBeGreaterThanOrEqual(0)
      expect(int).toBeLessThan(5)
      expect(Number.isInteger(int)).toBe(true)
      const range = rng.range(-3, 3)
      expect(range).toBeGreaterThanOrEqual(-3)
      expect(range).toBeLessThanOrEqual(3)
    }
  })

  it('treats a bound of zero as no choice at all', () => {
    expect(makeRng(1).int(0)).toBe(0)
  })

  it('covers every value of a small range', () => {
    const rng = makeRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 400; i += 1) seen.add(rng.range(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('picks from a list and refuses an empty one', () => {
    const rng = makeRng(5)
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']))
    expect(() => rng.pick([])).toThrow(/empty/)
  })

  it('forks independent streams per label', () => {
    const rng = makeRng(7)
    const a = rng.fork(1)
    const b = rng.fork(2)
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(
      Array.from({ length: 5 }, () => b.next()),
    )
  })
})

describe('seedFrom', () => {
  it('depends on the order of its parts', () => {
    expect(seedFrom(1, 2)).not.toBe(seedFrom(2, 1))
  })

  it('is stable', () => {
    expect(seedFrom(4, 5, 6)).toBe(seedFrom(4, 5, 6))
  })
})

describe('seededD6', () => {
  it('rolls whole numbers from one to six', () => {
    const roll = seededD6(makeRng(13))
    const seen = new Set<number>()
    for (let i = 0; i < 300; i += 1) {
      const value = roll()
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
      seen.add(value)
    }
    expect(seen.size).toBe(6)
  })
})
