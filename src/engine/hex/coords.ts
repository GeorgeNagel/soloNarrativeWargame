/**
 * Axial hex coordinates (pointy-top, "axial" q/r system).
 *
 * The third cube coordinate is always implied: s = -q - r.
 */
export interface Hex {
  readonly q: number
  readonly r: number
}

export function hex(q: number, r: number): Hex {
  return { q, r }
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r
}

/**
 * Number of hex steps between two tiles, i.e. the length of the shortest path
 * ignoring terrain. Derived from the cube-coordinate distance, where
 * s = -q - r and distance = max(|dq|, |dr|, |ds|).
 */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  const ds = -dq - dr
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
}

/**
 * The six edges a unit can face, listed counter-clockwise starting from east.
 * Adjacent entries are one 60° turn apart, and the list wraps around.
 */
export const HEX_DIRECTIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const

export type HexDirection = (typeof HEX_DIRECTIONS)[number]

/** The axial step taken by moving across each edge. */
export const HEX_DIRECTION_VECTORS: Record<HexDirection, Hex> = {
  E: hex(1, 0),
  NE: hex(1, -1),
  NW: hex(0, -1),
  W: hex(-1, 0),
  SW: hex(-1, 1),
  SE: hex(0, 1),
}

export function hexNeighbor(origin: Hex, direction: HexDirection): Hex {
  const step = HEX_DIRECTION_VECTORS[direction]
  return hex(origin.q + step.q, origin.r + step.r)
}

/** The six surrounding tiles, in `HEX_DIRECTIONS` order. */
export function hexNeighbors(origin: Hex): Hex[] {
  return HEX_DIRECTIONS.map((direction) => hexNeighbor(origin, direction))
}

export function hexIsAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1
}
