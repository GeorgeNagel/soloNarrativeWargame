/**
 * Scenario + order model for the "dense tactical console" prototype.
 *
 * Deliberately small and self-contained: this is a UI prototype, not an engine.
 * Everything hex-related leans on the shared helpers in `src/engine`.
 */
import {
  HEX_DIRECTIONS,
  HEX_DIRECTION_VECTORS,
  hex,
  hexToPixel,
} from '../../engine'
import type { Hex, HexDirection } from '../../engine'

export const TICKS_PER_ROUND = 3
export const BOARD_COLUMNS = 7
export const BOARD_ROWS = 7

export type Side = 'player' | 'enemy'

export type OrderKind = 'move' | 'left' | 'right' | 'hold'

export const ORDER_KINDS: readonly OrderKind[] = ['move', 'left', 'right', 'hold']

export interface OrderMeta {
  /** Three-character console code. */
  code: string
  glyph: string
  label: string
}

export const ORDER_META: Record<OrderKind, OrderMeta> = {
  move: { code: 'ADV', glyph: '▲', label: 'ADVANCE' },
  left: { code: 'L60', glyph: '↰', label: 'WHEEL L' },
  right: { code: 'R60', glyph: '↱', label: 'WHEEL R' },
  hold: { code: 'HLD', glyph: '■', label: 'HOLD' },
}

export interface UnitStats {
  attack: number
  defense: number
  hp: number
  movement: number
}

export interface UnitState {
  id: string
  /** Full roster name. */
  name: string
  /** Short console callsign, <= 6 chars. */
  tag: string
  side: Side
  models: number
  startModels: number
  pos: Hex
  facing: HexDirection
  /** Continuous screen-space rotation, so wheels animate the short way round. */
  angle: number
  stats: UnitStats
}

export type OrderSlots = (OrderKind | null)[]

export const PIKEMEN: UnitStats = { attack: 10, defense: 8, hp: 5, movement: 3 }

/** Rectangular board, row by row from the top left (matches `ui/components/HexGrid`). */
export function boardTiles(columns = BOARD_COLUMNS, rows = BOARD_ROWS): Hex[] {
  const tiles: Hex[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push(hex(column - Math.floor(row / 2), row))
    }
  }
  return tiles
}

export function hexKey(tile: Hex): string {
  return `${tile.q},${tile.r}`
}

/** Screen-space angle (degrees, y-down) of the edge a unit faces. */
export function facingAngle(direction: HexDirection): number {
  const point = hexToPixel(HEX_DIRECTION_VECTORS[direction], 1)
  return (Math.atan2(point.y, point.x) * 180) / Math.PI
}

/** `HEX_DIRECTIONS` runs counter-clockwise, so a left wheel steps forward in it. */
export function wheel(direction: HexDirection, towards: 'left' | 'right'): HexDirection {
  const index = HEX_DIRECTIONS.indexOf(direction)
  const step = towards === 'left' ? 1 : HEX_DIRECTIONS.length - 1
  return HEX_DIRECTIONS[(index + step) % HEX_DIRECTIONS.length]
}

/** The edge of `from` that `to` sits across, or null if they are not neighbours. */
export function edgeBetween(from: Hex, to: Hex): HexDirection | null {
  const dq = to.q - from.q
  const dr = to.r - from.r
  for (const direction of HEX_DIRECTIONS) {
    const vector = HEX_DIRECTION_VECTORS[direction]
    if (vector.q === dq && vector.r === dr) return direction
  }
  return null
}

/** Facing edge + its two neighbours are front; the other three are flank. */
export function isFlankAttack(defender: UnitState, attackerPos: Hex): boolean {
  const edge = edgeBetween(defender.pos, attackerPos)
  if (!edge) return false
  const count = HEX_DIRECTIONS.length
  const a = HEX_DIRECTIONS.indexOf(edge)
  const b = HEX_DIRECTIONS.indexOf(defender.facing)
  const spread = Math.min((a - b + count) % count, (b - a + count) % count)
  return spread > 1
}

/**
 * The fixed scenario: three pikemen blocks a side.
 *
 * Both lines are staggered — wings forward, centre refused — and sit mirrored
 * through the board's centre hex, so a straight three-tick advance puts the two
 * wings into contact on the same tick while the centre is left a wheel short.
 */
interface RosterEntry {
  tag: string
  name: string
  pos: Hex
}

const PLAYER_START: RosterEntry[] = [
  { tag: 'PK-01', name: '1st Pike, Aubin Levy', pos: hex(-1, 5) },
  { tag: 'PK-02', name: '2nd Pike, Marsan', pos: hex(0, 6) },
  { tag: 'PK-03', name: '3rd Pike, Guiscard', pos: hex(2, 5) },
]

const ENEMY_START: RosterEntry[] = [
  { tag: 'BR-07', name: 'Brabant Pikes VII', pos: hex(5, 1) },
  { tag: 'BR-08', name: 'Brabant Pikes VIII', pos: hex(4, 0) },
  { tag: 'BR-09', name: 'Brabant Pikes IX', pos: hex(2, 1) },
]

function buildSide(
  side: Side,
  facing: HexDirection,
  roster: RosterEntry[],
): UnitState[] {
  return roster.map((entry, index) => ({
    id: `${side === 'player' ? 'plr' : 'enm'}-${index + 1}`,
    name: entry.name,
    tag: entry.tag,
    side,
    models: 20,
    startModels: 20,
    pos: entry.pos,
    facing,
    angle: facingAngle(facing),
    stats: PIKEMEN,
  }))
}

export function initialUnits(): UnitState[] {
  return [
    ...buildSide('player', 'NE', PLAYER_START),
    ...buildSide('enemy', 'SW', ENEMY_START),
  ]
}

export function emptySlots(): OrderSlots {
  return Array.from({ length: TICKS_PER_ROUND }, () => null)
}

export function assignedPoints(slots: OrderSlots): number {
  return slots.filter((slot) => slot !== null).length
}

/** Planning state of one unit's queue — drives the matrix and the board rings. */
export type QueueState = 'empty' | 'part' | 'armed'

export function queueState(slots: OrderSlots, points: number): QueueState {
  const spent = assignedPoints(slots)
  if (spent === 0) return 'empty'
  return spent >= points ? 'armed' : 'part'
}
