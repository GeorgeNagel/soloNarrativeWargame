import { describe, expect, it } from 'vitest'

import { hex, hexDistance, hexEquals } from '../index'

describe('hexDistance', () => {
  it('is zero for a tile and itself', () => {
    expect(hexDistance(hex(0, 0), hex(0, 0))).toBe(0)
    expect(hexDistance(hex(3, -2), hex(3, -2))).toBe(0)
  })

  it('is one for each of the six neighbours', () => {
    const neighbours = [
      hex(1, 0),
      hex(1, -1),
      hex(0, -1),
      hex(-1, 0),
      hex(-1, 1),
      hex(0, 1),
    ]
    for (const neighbour of neighbours) {
      expect(hexDistance(hex(0, 0), neighbour)).toBe(1)
    }
  })

  it('counts steps along a straight line', () => {
    expect(hexDistance(hex(0, 0), hex(4, 0))).toBe(4)
    expect(hexDistance(hex(0, 0), hex(0, -3))).toBe(3)
    expect(hexDistance(hex(0, 0), hex(-2, 2))).toBe(2)
  })

  it('does not double-count diagonal-looking moves', () => {
    // (2, -1) is reached in 2 steps: (1, 0) then (1, -1) relative moves.
    expect(hexDistance(hex(0, 0), hex(2, -1))).toBe(2)
    // (2, 1), by contrast, needs 3 steps because q and r pull the same way.
    expect(hexDistance(hex(0, 0), hex(2, 1))).toBe(3)
  })

  it('is symmetric', () => {
    const a = hex(-3, 5)
    const b = hex(2, -4)
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
  })
})

describe('hexEquals', () => {
  it('compares by coordinate, not identity', () => {
    expect(hexEquals(hex(1, -1), hex(1, -1))).toBe(true)
    expect(hexEquals(hex(1, -1), hex(-1, 1))).toBe(false)
  })
})
