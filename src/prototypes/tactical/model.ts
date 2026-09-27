/**
 * Scenario + order model for the tactical console.
 *
 * The rules are adapted from the Ancient Wargames Rules in Neil Thomas,
 * *One-Hour Wargames*, ch. 3 — see `docs/` for the spec this implements.
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

/** A unit is removed from play once it has acquired this many hits. */
export const HITS_TO_ELIMINATE = 15

export type Side = 'player' | 'enemy'

// ── unit types ────────────────────────────────────────────

export type UnitType = 'infantry' | 'archers' | 'skirmishers' | 'cavalry'

export const UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'archers',
  'skirmishers',
  'cavalry',
]

export interface UnitProfile {
  /** Three-character console code. */
  code: string
  label: string
  /** Added to the d6 when this type inflicts hits in melee. */
  meleeModifier: number
  /** Hexes this type may advance in a round. */
  movement: number
  /** Armoured targets acquire half the hits mandated against them. */
  armoured: boolean
}

/**
 * The book's four types. Movement converts its inches at 3" per hex: Infantry
 * and Archers 6", Skirmishers 9", Cavalry 12".
 */
export const UNIT_PROFILES: Record<UnitType, UnitProfile> = {
  infantry: {
    code: 'INF',
    label: 'INFANTRY',
    meleeModifier: 2,
    movement: 2,
    armoured: true,
  },
  archers: {
    code: 'ARC',
    label: 'ARCHERS',
    meleeModifier: 0,
    movement: 2,
    armoured: false,
  },
  skirmishers: {
    code: 'SKM',
    label: 'SKIRMISHERS',
    meleeModifier: -2,
    movement: 3,
    armoured: false,
  },
  cavalry: {
    code: 'CAV',
    label: 'CAVALRY',
    meleeModifier: 0,
    movement: 4,
    armoured: false,
  },
}

export interface UnitState {
  id: string
  /** Full roster name. */
  name: string
  /** Short console callsign, <= 6 chars. */
  tag: string
  side: Side
  type: UnitType
  /** Hits acquired so far. At `HITS_TO_ELIMINATE` the unit is gone. */
  hits: number
  pos: Hex
  facing: HexDirection
  /** Continuous screen-space rotation, so wheels animate the short way round. */
  angle: number
}

export function profileOf(unit: UnitState): UnitProfile {
  return UNIT_PROFILES[unit.type]
}

export function isAlive(unit: UnitState): boolean {
  return unit.hits < HITS_TO_ELIMINATE
}

/** Hexes this unit may still advance, given what its queue already spends. */
export function movementOf(unit: UnitState): number {
  return profileOf(unit).movement
}

// ── orders ────────────────────────────────────────────────

export type Wheel = 'left' | 'right'

/**
 * One tick's order: a free 60° wheel, then any number of advances the unit can
 * still pay for. `null` in a queue means the tick has not been decided yet.
 */
export interface TickOrder {
  wheel: Wheel | null
  advances: number
}

export type OrderSlots = (TickOrder | null)[]

/** The most advances one unit may pack into a single tick. */
export const MAX_ADVANCES_PER_TICK = 2

export function tickOrder(wheel: Wheel | null, advances: number): TickOrder {
  return { wheel, advances }
}

export const HOLD: TickOrder = { wheel: null, advances: 0 }

export function emptySlots(): OrderSlots {
  return Array.from({ length: TICKS_PER_ROUND }, () => null)
}

/** Advances spent across a whole queue — wheels are free, so they do not count. */
export function spentAdvances(slots: OrderSlots): number {
  return slots.reduce((sum, slot) => sum + (slot?.advances ?? 0), 0)
}

/** Ticks the player has actually decided, filled or not. */
export function decidedTicks(slots: OrderSlots): number {
  return slots.filter((slot) => slot !== null).length
}

/** A queue is ready once every tick has been decided. */
export function isReady(slots: OrderSlots): boolean {
  return decidedTicks(slots) >= TICKS_PER_ROUND
}

/** Planning state of one unit's queue — drives the matrix and the board rings. */
export type QueueState = 'empty' | 'part' | 'armed'

export function queueState(slots: OrderSlots): QueueState {
  const decided = decidedTicks(slots)
  if (decided === 0) return 'empty'
  return decided >= TICKS_PER_ROUND ? 'armed' : 'part'
}

/** Compact console rendering of a tick's order, e.g. `↰ADV` or `ADV×2`. */
export function orderCode(order: TickOrder | null): string {
  if (!order) return '···'
  const wheel = order.wheel === 'left' ? 'L60' : order.wheel === 'right' ? 'R60' : ''
  if (order.advances === 0) return wheel || 'HLD'
  const advance = order.advances > 1 ? `ADV×${order.advances}` : 'ADV'
  return wheel ? `${wheel}·${advance}` : advance
}

export const WHEEL_GLYPH: Record<Wheel, string> = { left: '↰', right: '↱' }

// ── hex geometry ──────────────────────────────────────────

/** Rectangular board, row by row from the top left. */
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
export function wheel(direction: HexDirection, towards: Wheel): HexDirection {
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

/** Facing edge + its two neighbours are front; the other three are rear. */
export function isRearAttack(defender: UnitState, attackerPos: Hex): boolean {
  const edge = edgeBetween(defender.pos, attackerPos)
  if (!edge) return false
  const count = HEX_DIRECTIONS.length
  const a = HEX_DIRECTIONS.indexOf(edge)
  const b = HEX_DIRECTIONS.indexOf(defender.facing)
  const spread = Math.min((a - b + count) % count, (b - a + count) % count)
  return spread > 1
}

// ── the scenario ──────────────────────────────────────────

/**
 * The fixed scenario: one of each type a side, lines mirrored through the
 * board's centre hex so the wings meet before the centre does.
 */
interface RosterEntry {
  tag: string
  name: string
  type: UnitType
  pos: Hex
}

const PLAYER_START: RosterEntry[] = [
  { tag: 'INF-01', name: '1st Foot, Aubin Levy', type: 'infantry', pos: hex(0, 6) },
  { tag: 'ARC-02', name: 'Levy Bowmen, Marsan', type: 'archers', pos: hex(-1, 5) },
  { tag: 'SKM-03', name: 'Guiscard Skirmishers', type: 'skirmishers', pos: hex(2, 5) },
  { tag: 'CAV-04', name: 'Aubin Horse', type: 'cavalry', pos: hex(1, 6) },
]

const ENEMY_START: RosterEntry[] = [
  { tag: 'BRB-11', name: 'Brabant Foot XI', type: 'infantry', pos: hex(4, 0) },
  { tag: 'BRB-12', name: 'Brabant Bowmen XII', type: 'archers', pos: hex(5, 1) },
  { tag: 'BRB-13', name: 'Brabant Skirmishers XIII', type: 'skirmishers', pos: hex(2, 1) },
  { tag: 'BRB-14', name: 'Brabant Horse XIV', type: 'cavalry', pos: hex(3, 0) },
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
    type: entry.type,
    hits: 0,
    pos: entry.pos,
    facing,
    angle: facingAngle(facing),
  }))
}

export function initialUnits(): UnitState[] {
  return [
    ...buildSide('player', 'NE', PLAYER_START),
    ...buildSide('enemy', 'SW', ENEMY_START),
  ]
}
