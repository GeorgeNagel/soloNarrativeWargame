import type { Hex } from './coordinates'

/** A position in pixel space, with y growing downwards as in SVG. */
export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Centre of a tile in pixel space, where `size` is the distance from the
 * centre of a pointy-top hex to any of its corners.
 */
export function hexToPixel(tile: Hex, size: number): Point {
  return {
    x: size * Math.sqrt(3) * (tile.q + tile.r / 2),
    y: size * (3 / 2) * tile.r,
  }
}

/** Width of a pointy-top hex, corner to corner across its flat sides. */
export function hexWidth(size: number): number {
  return Math.sqrt(3) * size
}

/** Height of a pointy-top hex, from its top corner to its bottom corner. */
export function hexHeight(size: number): number {
  return 2 * size
}

/**
 * The six corners of a pointy-top hex around `center`, listed clockwise from
 * the lower right. Each corner sits `size` away from the centre.
 */
export function hexCorners(center: Point, size: number): Point[] {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 180) * (60 * corner - 30)
    return {
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    }
  })
}
