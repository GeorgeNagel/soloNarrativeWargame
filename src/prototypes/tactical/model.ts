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
  hexDistance,
  hexEquals,
  hexToPixel,
} from '../../engine'
import type { Hex, HexDirection } from '../../engine'

export const BOARD_COLUMNS = 14
export const BOARD_ROWS = 14

/** A unit is removed from play once it has acquired this many hits. */
export const HITS_TO_ELIMINATE = 15

/**
 * Half-angle of a shooter's field of fire, in degrees. The book lets a unit
 * shoot "at a single target within 45° of their frontal facing".
 */
export const FIELD_OF_FIRE = 45

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
  /**
   * Added to the d6 when this type shoots, or null if it cannot shoot at all.
   * Zero is a real value here — archers shoot on an unmodified die.
   */
  shootModifier: number | null
  /** Range in hexes. Meaningless when the type cannot shoot. */
  range: number
}

/**
 * The book's four types. Distances convert at 3" per hex: movement of 6" /
 * 6" / 9" / 12", and a shooting range of 12" for the two types that shoot.
 */
export const UNIT_PROFILES: Record<UnitType, UnitProfile> = {
  infantry: {
    code: 'INF',
    label: 'INFANTRY',
    meleeModifier: 2,
    movement: 2,
    armoured: true,
    shootModifier: null,
    range: 0,
  },
  archers: {
    code: 'ARC',
    label: 'ARCHERS',
    meleeModifier: 0,
    movement: 2,
    armoured: false,
    shootModifier: 0,
    range: 4,
  },
  skirmishers: {
    code: 'SKM',
    label: 'SKIRMISHERS',
    meleeModifier: -2,
    movement: 3,
    armoured: false,
    shootModifier: -2,
    range: 4,
  },
  cavalry: {
    code: 'CAV',
    label: 'CAVALRY',
    meleeModifier: 0,
    movement: 4,
    armoured: false,
    shootModifier: null,
    range: 0,
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

/** Hexes this unit may advance in a round. */
export function movementOf(unit: UnitState): number {
  return profileOf(unit).movement
}

/** Only Archers and Skirmishers may shoot. */
export function canShoot(unit: UnitState): boolean {
  return profileOf(unit).shootModifier !== null
}

// ── orders ────────────────────────────────────────────────

export type Wheel = 'left' | 'right'

/** The most 60° wheels a unit may pack into one of a round's turn phases. */
export const MAX_TURNS_PER_PHASE = 3

/**
 * One unit's order for a whole round: turns, then a straight advance, then
 * turns again. A turn phase is a signed count of 60° wheels — negative to the
 * left, positive to the right — and `advance` is hexes in a straight line,
 * capped by the unit's type.
 */
export interface RoundOrder {
  before: number
  advance: number
  after: number
}

/** Every unit's order for the round. `null` is a unit nobody has ordered yet. */
export type OrderBook = Record<string, RoundOrder | null>

/** The three parts of an order, in the sequence they resolve. */
export type OrderPhase = 'before' | 'advance' | 'after'

export const ORDER_PHASES: readonly OrderPhase[] = ['before', 'advance', 'after']

/** Stand fast: no turns either side, no ground given up. */
export const HOLD: RoundOrder = { before: 0, advance: 0, after: 0 }

export function roundOrder(before = 0, advance = 0, after = 0): RoundOrder {
  return { before, advance, after }
}

/** The wheel a signed turn count means, or null when the phase does not turn. */
export function turnWheel(turns: number): Wheel | null {
  if (turns === 0) return null
  return turns < 0 ? 'left' : 'right'
}

/** Hold a turn phase to the three 60° steps it allows, either way. */
export function clampTurns(turns: number): number {
  return Math.max(-MAX_TURNS_PER_PHASE, Math.min(MAX_TURNS_PER_PHASE, turns))
}

/** The signed turn count of one of an order's two turn phases. */
export function turnsIn(order: RoundOrder, phase: OrderPhase): number {
  if (phase === 'before') return order.before
  if (phase === 'after') return order.after
  return 0
}

/** A unit is ready once somebody has written its order for the round. */
export function isReady(order: RoundOrder | null | undefined): boolean {
  return order != null
}

/** Planning state of one unit's order — drives the matrix and the board rings. */
export type QueueState = 'empty' | 'armed'

export function queueState(order: RoundOrder | null | undefined): QueueState {
  return order ? 'armed' : 'empty'
}

/** Compact console rendering of one phase, e.g. `L60×2`, `ADV×3` or `HLD`. */
export function phaseCode(
  order: RoundOrder | null | undefined,
  phase: OrderPhase,
): string {
  if (!order) return '···'
  if (phase === 'advance') {
    if (order.advance === 0) return 'HLD'
    return order.advance > 1 ? `ADV×${order.advance}` : 'ADV'
  }
  const turns = turnsIn(order, phase)
  if (turns === 0) return '—'
  const code = turns < 0 ? 'L60' : 'R60'
  return Math.abs(turns) > 1 ? `${code}×${Math.abs(turns)}` : code
}

/** The whole order on one line, the way the tokens and the log read it. */
export function orderCode(order: RoundOrder | null | undefined): string {
  if (!order) return '···'
  return ORDER_PHASES.map((phase) => phaseCode(order, phase))
    .filter((code) => code !== '—')
    .join('·')
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

/** Screen-space bearing (degrees, y-down) from one hex's centre to another's. */
export function bearingBetween(from: Hex, to: Hex): number {
  const a = hexToPixel(from, 1)
  const b = hexToPixel(to, 1)
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

/** Smallest absolute difference between two bearings, in degrees. */
export function angleBetween(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360
  return delta > 180 ? 360 - delta : delta
}

/**
 * Whether `target` lies in the shooter's field of fire — the book's 45° either
 * side of the faced edge, measured as a real bearing so the cone widens with
 * distance the way it does on the tabletop.
 */
export function inFieldOfFire(shooter: UnitState, target: Hex): boolean {
  if (hexEquals(shooter.pos, target)) return false
  const bearing = bearingBetween(shooter.pos, target)
  return angleBetween(facingAngle(shooter.facing), bearing) <= FIELD_OF_FIRE
}

/** Whether `target` is a legal shot for this unit: in range and in the cone. */
export function canShootAt(shooter: UnitState, target: Hex): boolean {
  if (!canShoot(shooter)) return false
  if (hexDistance(shooter.pos, target) > profileOf(shooter).range) return false
  return inFieldOfFire(shooter, target)
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
 * The fixed scenario: one of each type a side, lines point-mirrored through the
 * board's centre so the wings meet before the centre does.
 */
interface RosterEntry {
  tag: string
  name: string
  type: UnitType
  pos: Hex
}

const PLAYER_START: RosterEntry[] = [
  { tag: 'INF-01', name: '1st Foot, Aubin Levy', type: 'infantry', pos: hex(0, 13) },
  { tag: 'ARC-02', name: 'Levy Bowmen, Marsan', type: 'archers', pos: hex(-2, 12) },
  { tag: 'SKM-03', name: 'Guiscard Skirmishers', type: 'skirmishers', pos: hex(1, 12) },
  { tag: 'CAV-04', name: 'Aubin Horse', type: 'cavalry', pos: hex(1, 13) },
]

const ENEMY_START: RosterEntry[] = [
  { tag: 'BRB-11', name: 'Brabant Foot XI', type: 'infantry', pos: hex(7, 0) },
  { tag: 'BRB-12', name: 'Brabant Bowmen XII', type: 'archers', pos: hex(9, 1) },
  { tag: 'BRB-13', name: 'Brabant Skirmishers XIII', type: 'skirmishers', pos: hex(6, 1) },
  { tag: 'BRB-14', name: 'Brabant Horse XIV', type: 'cavalry', pos: hex(6, 0) },
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
