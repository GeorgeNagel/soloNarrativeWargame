/**
 * Tiny simulation layer for the "radial controls + scrubbable timeline"
 * prototype. Deliberately not an engine: just enough rules to make the board
 * move, fight and be scrubbed through.
 */
import {
  HEX_DIRECTIONS,
  HEX_DIRECTION_VECTORS,
  hex,
  hexEquals,
  hexIsAdjacent,
  hexNeighbor,
  hexToPixel,
} from '../../engine'
import type { Hex, HexDirection, Point } from '../../engine'

export const HEX_SIZE = 40
export const TICKS = 3
export const BOARD_COLS = 7
export const BOARD_ROWS = 7

export const PIKEMEN = { attack: 10, defense: 8, hp: 5, movement: 3 } as const

export type Side = 'player' | 'enemy'
export type OrderType = 'move' | 'left' | 'right' | 'hold'
export type OrderSlots = readonly (OrderType | null)[]

export interface UnitSnapshot {
  readonly id: string
  readonly side: Side
  readonly name: string
  readonly models: number
  readonly hex: Hex
  readonly facing: HexDirection
}

export interface Clash {
  readonly attackerId: string
  readonly defenderId: string
  readonly attackerHex: Hex
  readonly defenderHex: Hex
  readonly flank: boolean
  readonly wounds: number
  readonly removed: number
}

export interface Frame {
  readonly units: readonly UnitSnapshot[]
  readonly clashes: readonly Clash[]
  readonly blocked: readonly string[]
}

/** Rectangular 7x7 board, row by row from the top left. */
export function boardTiles(): Hex[] {
  const tiles: Hex[] = []
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      tiles.push(hex(col - Math.floor(row / 2), row))
    }
  }
  return tiles
}

export function isOnBoard(tile: Hex): boolean {
  const col = tile.q + Math.floor(tile.r / 2)
  return tile.r >= 0 && tile.r < BOARD_ROWS && col >= 0 && col < BOARD_COLS
}

export function center(tile: Hex): Point {
  return hexToPixel(tile, HEX_SIZE)
}

function angleOf(direction: HexDirection): number {
  const step = hexToPixel(HEX_DIRECTION_VECTORS[direction], 1)
  return (Math.atan2(step.y, step.x) * 180) / Math.PI
}

/** Screen-space bearing of each facing, in degrees (0 = east, y grows down). */
export const DIRECTION_ANGLE: Record<HexDirection, number> = HEX_DIRECTIONS.reduce(
  (all, direction) => ({ ...all, [direction]: angleOf(direction) }),
  {} as Record<HexDirection, number>,
)

export function turn(facing: HexDirection, way: 'left' | 'right'): HexDirection {
  const index = HEX_DIRECTIONS.indexOf(facing)
  return HEX_DIRECTIONS[(index + (way === 'left' ? 1 : 5)) % 6]
}

function edgeBetween(from: Hex, to: Hex): HexDirection | null {
  return HEX_DIRECTIONS.find((direction) => hexEquals(hexNeighbor(from, direction), to)) ?? null
}

/** The facing edge and its two neighbours are front; the other three are flank. */
export function isFlankAttack(defender: UnitSnapshot, attackerHex: Hex): boolean {
  const edge = edgeBetween(defender.hex, attackerHex)
  if (!edge) return false
  const front = [defender.facing, turn(defender.facing, 'left'), turn(defender.facing, 'right')]
  return !front.includes(edge)
}

export const ORDER_LABEL: Record<OrderType, string> = {
  move: 'Advance',
  left: 'Wheel left',
  right: 'Wheel right',
  hold: 'Hold',
}

export function spentPoints(slots: OrderSlots): number {
  return slots.filter((slot) => slot !== null).length
}

export function isComplete(slots: OrderSlots): boolean {
  return spentPoints(slots) >= TICKS
}

export function emptySlots(): OrderSlots {
  return [null, null, null]
}

/** One tick: every unit spends its single point, moves resolve together. */
function applyTick(
  units: readonly UnitSnapshot[],
  orders: Record<string, OrderSlots>,
  tick: number,
): { units: UnitSnapshot[]; blocked: string[] } {
  const intents = units.map((unit) => {
    const order = orders[unit.id]?.[tick] ?? 'hold'
    if (order === 'left' || order === 'right') {
      return { unit, dest: unit.hex, facing: turn(unit.facing, order), moving: false }
    }
    if (order === 'move') {
      return { unit, dest: hexNeighbor(unit.hex, unit.facing), facing: unit.facing, moving: true }
    }
    return { unit, dest: unit.hex, facing: unit.facing, moving: false }
  })

  const blocked: string[] = []
  const resolved = intents.map((intent) => {
    if (!intent.moving) return intent
    const offBoard = !isOnBoard(intent.dest)
    const intoSomeone = intents.some(
      (other) =>
        other.unit.id !== intent.unit.id &&
        (hexEquals(other.dest, intent.dest) ||
          (!other.moving && hexEquals(other.unit.hex, intent.dest))),
    )
    if (offBoard || intoSomeone) {
      blocked.push(intent.unit.id)
      return { ...intent, dest: intent.unit.hex, moving: false }
    }
    return intent
  })

  return {
    units: resolved.map(({ unit, dest, facing }) => ({ ...unit, hex: dest, facing })),
    blocked,
  }
}

/** Contact is combat: everybody adjacent at the boundary swings at once. */
function resolveCombat(units: readonly UnitSnapshot[]): {
  units: UnitSnapshot[]
  clashes: Clash[]
} {
  const clashes: Clash[] = []
  const losses: Record<string, number> = {}

  for (const attacker of units) {
    for (const defender of units) {
      if (attacker.side === defender.side) continue
      if (!hexIsAdjacent(attacker.hex, defender.hex)) continue
      const flank = isFlankAttack(defender, attacker.hex)
      const defense = flank ? Math.floor(PIKEMEN.defense / 2) : PIKEMEN.defense
      const wounds = Math.max(0, PIKEMEN.attack * attacker.models - defense * defender.models)
      const removed = Math.floor(wounds / PIKEMEN.hp)
      clashes.push({
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerHex: attacker.hex,
        defenderHex: defender.hex,
        flank,
        wounds,
        removed,
      })
      losses[defender.id] = (losses[defender.id] ?? 0) + removed
    }
  }

  return {
    // Prototype fudge: a unit never fully evaporates, so there is no end state.
    units: units.map((unit) => ({
      ...unit,
      models: Math.max(1, unit.models - (losses[unit.id] ?? 0)),
    })),
    clashes: clashes.filter((clash) => clash.removed > 0),
  }
}

export function simulate(
  start: readonly UnitSnapshot[],
  orders: Record<string, OrderSlots>,
): Frame[] {
  const frames: Frame[] = [{ units: start, clashes: [], blocked: [] }]
  let current: readonly UnitSnapshot[] = start
  for (let tick = 0; tick < TICKS; tick += 1) {
    const stepped = applyTick(current, orders, tick)
    const fought = resolveCombat(stepped.units)
    frames.push({ units: fought.units, clashes: fought.clashes, blocked: stepped.blocked })
    current = fought.units
  }
  return frames
}

export interface RenderUnit {
  readonly id: string
  readonly side: Side
  readonly name: string
  readonly models: number
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly facing: HexDirection
  readonly hex: Hex
  readonly moving: boolean
}

function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/** The board at a continuous playhead position, 0 = round start, 3 = round end. */
export function unitsAt(frames: readonly Frame[], playhead: number): RenderUnit[] {
  const clamped = Math.max(0, Math.min(frames.length - 1, playhead))
  const index = Math.min(frames.length - 2, Math.floor(clamped))
  const fraction = clamped - index
  const eased = easeInOut(Math.max(0, Math.min(1, fraction)))
  const from = frames[index]
  const to = frames[index + 1]

  return from.units.map((unit) => {
    const next = to.units.find((candidate) => candidate.id === unit.id) ?? unit
    const a = center(unit.hex)
    const b = center(next.hex)
    const fromAngle = DIRECTION_ANGLE[unit.facing]
    const angle = fromAngle + shortestDelta(fromAngle, DIRECTION_ANGLE[next.facing]) * eased
    return {
      id: unit.id,
      side: unit.side,
      name: unit.name,
      // Models are lost at the tick boundary, so hold the old number until then.
      models: fraction > 0.86 ? next.models : unit.models,
      x: a.x + (b.x - a.x) * eased,
      y: a.y + (b.y - a.y) * eased,
      angle,
      facing: fraction > 0.5 ? next.facing : unit.facing,
      hex: fraction > 0.5 ? next.hex : unit.hex,
      moving: !hexEquals(unit.hex, next.hex),
    }
  })
}

export function scenarioUnits(): UnitSnapshot[] {
  return [
    {
      id: 'player-pikemen',
      side: 'player',
      name: 'Ashford Pikes',
      models: 20,
      hex: hex(0, 6),
      facing: 'NE',
    },
    {
      id: 'enemy-pikemen',
      side: 'enemy',
      name: 'Varlet Spears',
      models: 20,
      hex: hex(3, 0),
      facing: 'SW',
    },
  ]
}

export type Phase = 'planning' | 'resolving' | 'review'
