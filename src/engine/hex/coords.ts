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
