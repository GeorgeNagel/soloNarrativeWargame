import { describe, expect, it } from 'vitest'

import {
  HEX_DIRECTION_VECTORS,
  HEX_DIRECTIONS,
  hex,
  hexDistance,
  hexEquals,
  hexIsAdjacent,
  hexNeighbor,
  hexNeighbors,
} from '../index'
import type { Hex } from '../index'

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

/** A patch of tiles wide enough to contain a hex and all of its neighbours. */
const sampleTiles = (): Hex[] => {
  const tiles: Hex[] = []
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      tiles.push(hex(q, r))
    }
  }
  return tiles
}

describe('HEX_DIRECTIONS', () => {
  it('names six distinct edges', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6)
    expect(new Set(HEX_DIRECTIONS).size).toBe(6)
  })

  it('pairs each edge with the opposite step three turns away', () => {
    HEX_DIRECTIONS.forEach((direction, index) => {
      const opposite = HEX_DIRECTIONS[(index + 3) % 6]
      const step = HEX_DIRECTION_VECTORS[direction]
      const back = HEX_DIRECTION_VECTORS[opposite]
      expect(hex(step.q + back.q, step.r + back.r)).toEqual(hex(0, 0))
    })
  })
})

describe('hexNeighbor', () => {
  it('steps one tile across the named edge', () => {
    const origin = hex(2, -1)
    expect(hexNeighbor(origin, 'E')).toEqual(hex(3, -1))
    expect(hexNeighbor(origin, 'NE')).toEqual(hex(3, -2))
    expect(hexNeighbor(origin, 'NW')).toEqual(hex(2, -2))
    expect(hexNeighbor(origin, 'W')).toEqual(hex(1, -1))
    expect(hexNeighbor(origin, 'SW')).toEqual(hex(1, 0))
    expect(hexNeighbor(origin, 'SE')).toEqual(hex(2, 0))
  })

  it('returns to the origin when stepping back the other way', () => {
    const origin = hex(-4, 2)
    HEX_DIRECTIONS.forEach((direction, index) => {
      const opposite = HEX_DIRECTIONS[(index + 3) % 6]
      expect(hexNeighbor(hexNeighbor(origin, direction), opposite)).toEqual(origin)
    })
  })
})

describe('hexNeighbors', () => {
  it('lists the six surrounding tiles in HEX_DIRECTIONS order', () => {
    expect(hexNeighbors(hex(0, 0))).toEqual([
      hex(1, 0),
      hex(1, -1),
      hex(0, -1),
      hex(-1, 0),
      hex(-1, 1),
      hex(0, 1),
    ])
  })

  it('agrees with stepping across each edge in turn', () => {
    const origin = hex(5, -2)
    expect(hexNeighbors(origin)).toEqual(
      HEX_DIRECTIONS.map((direction) => hexNeighbor(origin, direction)),
    )
  })

  it('returns six distinct tiles, each one step away', () => {
    for (const tile of sampleTiles()) {
      const neighbours = hexNeighbors(tile)
      expect(neighbours).toHaveLength(6)
      expect(new Set(neighbours.map(({ q, r }) => `${q},${r}`)).size).toBe(6)
      for (const neighbour of neighbours) {
        expect(hexDistance(tile, neighbour)).toBe(1)
        expect(hexEquals(tile, neighbour)).toBe(false)
      }
    }
  })

  it('is mutual: each neighbour lists the original tile back', () => {
    for (const tile of sampleTiles()) {
      for (const neighbour of hexNeighbors(tile)) {
        expect(hexNeighbors(neighbour).some((back) => hexEquals(back, tile))).toBe(true)
      }
    }
  })
})

describe('hexIsAdjacent', () => {
  it('is false for a tile and itself', () => {
    expect(hexIsAdjacent(hex(0, 0), hex(0, 0))).toBe(false)
  })

  it('is true for neighbours and false for anything further out', () => {
    expect(hexIsAdjacent(hex(0, 0), hex(1, -1))).toBe(true)
    expect(hexIsAdjacent(hex(0, 0), hex(2, -1))).toBe(false)
    expect(hexIsAdjacent(hex(0, 0), hex(2, 1))).toBe(false)
  })

  it('matches a distance of exactly one across the sample patch', () => {
    const tiles = sampleTiles()
    for (const a of tiles) {
      for (const b of tiles) {
        expect(hexIsAdjacent(a, b)).toBe(hexDistance(a, b) === 1)
      }
    }
  })

  it('is symmetric', () => {
    const tiles = sampleTiles()
    for (const a of tiles) {
      for (const b of tiles) {
        expect(hexIsAdjacent(a, b)).toBe(hexIsAdjacent(b, a))
      }
    }
  })
})

describe('hexDistance symmetry', () => {
  it('holds for every pair across the sample patch', () => {
    const tiles = sampleTiles()
    for (const a of tiles) {
      for (const b of tiles) {
        expect(hexDistance(a, b)).toBe(hexDistance(b, a))
      }
    }
  })
})
