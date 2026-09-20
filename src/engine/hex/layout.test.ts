import { describe, expect, it } from 'vitest'

import { hex, hexCorners, hexHeight, hexNeighbors, hexToPixel, hexWidth } from '../index'
import type { Point } from '../index'

const SIZE = 10

function pixelDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('hexToPixel', () => {
  it('places the origin tile at the pixel origin', () => {
    expect(hexToPixel(hex(0, 0), SIZE)).toEqual({ x: 0, y: 0 })
  })

  it('places every neighbour one hex width away', () => {
    const center = hexToPixel(hex(0, 0), SIZE)
    for (const neighbour of hexNeighbors(hex(0, 0))) {
      expect(pixelDistance(center, hexToPixel(neighbour, SIZE))).toBeCloseTo(hexWidth(SIZE))
    }
  })

  it('offsets each row by half a hex width', () => {
    expect(hexToPixel(hex(0, 1), SIZE).x).toBeCloseTo(hexWidth(SIZE) / 2)
    expect(hexToPixel(hex(0, 1), SIZE).y).toBeCloseTo((3 / 4) * hexHeight(SIZE))
  })
})

describe('hexCorners', () => {
  it('returns six corners, each one size from the centre', () => {
    const center = { x: 5, y: -3 }
    const corners = hexCorners(center, SIZE)
    expect(corners).toHaveLength(6)
    for (const corner of corners) {
      expect(pixelDistance(center, corner)).toBeCloseTo(SIZE)
    }
  })

  it('spans one hex width horizontally and one hex height vertically', () => {
    const corners = hexCorners({ x: 0, y: 0 }, SIZE)
    const xs = corners.map((corner) => corner.x)
    const ys = corners.map((corner) => corner.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(hexWidth(SIZE))
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(hexHeight(SIZE))
  })

  it('shares two corners with each neighbouring tile', () => {
    const corners = hexCorners(hexToPixel(hex(0, 0), SIZE), SIZE)
    for (const neighbour of hexNeighbors(hex(0, 0))) {
      const shared = hexCorners(hexToPixel(neighbour, SIZE), SIZE).filter((corner) =>
        corners.some((own) => pixelDistance(own, corner) < 1e-9),
      )
      expect(shared).toHaveLength(2)
    }
  })
})
