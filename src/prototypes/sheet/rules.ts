import {
  HEX_DIRECTIONS,
  hex,
  hexIsAdjacent,
  hexNeighbor,
  hexToPixel,
} from '../../engine'
import type { Hex, HexDirection, Point } from '../../engine'

export const BOARD_COLUMNS = 7
export const BOARD_ROWS = 7
export const HEX_SIZE = 10
export const TICKS_PER_ROUND = 3

export type OrderType = 'move' | 'left' | 'right' | 'hold'
export type Slots = (OrderType | null)[]
export type Side = 'player' | 'enemy'
export type UnitId = 'hawk' | 'boar' | 'stag' | 'wolf' | 'raven' | 'adder'

export interface UnitState {
  readonly id: UnitId
  readonly side: Side
  /** Full name, shown in the sheet and the roster. */
  readonly name: string
  /** One letter, stamped on the token so six companies stay tellable apart. */
  readonly badge: string
  readonly tile: Hex
  /** Index into HEX_DIRECTIONS. */
  readonly dir: number
  /** Continuous screen angle in degrees, so turns animate the short way round. */
  readonly angle: number
  readonly models: number
}

export type Units = Record<UnitId, UnitState>
export type OrderBook = Record<UnitId, Slots>

export const PIKEMEN = { attack: 10, defense: 8, hp: 5, movement: 3 } as const

/** Board tiles, row by row from the top left (same scheme as the shared HexGrid). */
export function boardTiles(): Hex[] {
  const tiles: Hex[] = []
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column < BOARD_COLUMNS; column += 1) {
      tiles.push(hex(column - Math.floor(row / 2), row))
    }
  }
  return tiles
}

const TILE_KEYS = new Set(boardTiles().map((tile) => `${tile.q},${tile.r}`))

export function onBoard(tile: Hex): boolean {
  return TILE_KEYS.has(`${tile.q},${tile.r}`)
}

export function center(tile: Hex): Point {
  return hexToPixel(tile, HEX_SIZE)
}

/** Screen angle of a facing: E is 0deg and each step counter-clockwise is -60deg. */
export function angleOf(dir: number): number {
  return -60 * dir
}

export function directionName(dir: number): HexDirection {
  return HEX_DIRECTIONS[((dir % 6) + 6) % 6]
}

function pike(
  id: UnitId,
  side: Side,
  name: string,
  badge: string,
  tile: Hex,
  dir: number,
): UnitState {
  return { id, side, name, badge, tile, dir, angle: angleOf(dir), models: 20 }
}

export const PLAYER_IDS: UnitId[] = ['hawk', 'boar', 'stag']
export const ENEMY_IDS: UnitId[] = ['adder', 'raven', 'wolf']
export const UNIT_IDS: UnitId[] = [...PLAYER_IDS, ...ENEMY_IDS]

/**
 * Three companies a side, drawn up as a shallow wedge: the centre company of
 * each line stands a row forward of its wings, so the lines meet unevenly.
 */
export const INITIAL_UNITS: Units = {
  hawk: pike('hawk', 'player', 'Hawk Company', 'H', hex(-2, 6), 1),
  boar: pike('boar', 'player', 'Boar Company', 'B', hex(1, 5), 1),
  stag: pike('stag', 'player', 'Stag Company', 'S', hex(2, 6), 2),
  adder: pike('adder', 'enemy', 'Adder Banner', 'A', hex(1, 0), 5),
  raven: pike('raven', 'enemy', 'Raven Banner', 'R', hex(3, 1), 5),
  wolf: pike('wolf', 'enemy', 'Wolf Banner', 'W', hex(5, 0), 4),
}

export const emptySlots = (): Slots => [null, null, null]
export const holdSlots = (): Slots => ['hold', 'hold', 'hold']

export function freshOrders(): OrderBook {
  return {
    hawk: emptySlots(),
    boar: emptySlots(),
    stag: emptySlots(),
    adder: holdSlots(),
    raven: holdSlots(),
    wolf: holdSlots(),
  }
}

export function assignedCount(slots: Slots): number {
  return slots.filter((slot) => slot !== null).length
}

export function slotsComplete(slots: Slots): boolean {
  return assignedCount(slots) === TICKS_PER_ROUND
}

/** A company still owes orders when it is alive and short of three points. */
export function needsOrders(unit: UnitState, slots: Slots): boolean {
  return unit.models > 0 && !slotsComplete(slots)
}

export function unorderedIds(units: Units, orders: OrderBook): UnitId[] {
  return PLAYER_IDS.filter((id) => needsOrders(units[id], orders[id]))
}

/** Strict gate: every living company of yours must have spent all three points. */
export function playerReady(units: Units, orders: OrderBook): boolean {
  return unorderedIds(units, orders).length === 0
}

export function pointsLeft(units: Units, orders: OrderBook): number {
  return PLAYER_IDS.reduce(
    (total, id) =>
      units[id].models > 0 ? total + (PIKEMEN.movement - assignedCount(orders[id])) : total,
    0,
  )
}

export interface StepResult {
  readonly unit: UnitState
  readonly blocked: boolean
}

/** Apply one order, refusing moves off the board or into an occupied tile. */
export function applyOrder(unit: UnitState, order: OrderType, blockedTiles: Hex[]): StepResult {
  if (order === 'left') {
    return { unit: { ...unit, dir: (unit.dir + 1) % 6, angle: unit.angle - 60 }, blocked: false }
  }
  if (order === 'right') {
    return { unit: { ...unit, dir: (unit.dir + 5) % 6, angle: unit.angle + 60 }, blocked: false }
  }
  if (order === 'hold') return { unit, blocked: false }

  const target = hexNeighbor(unit.tile, directionName(unit.dir))
  const occupied = blockedTiles.some((tile) => tile.q === target.q && tile.r === target.r)
  if (!onBoard(target) || occupied) return { unit, blocked: true }
  return { unit: { ...unit, tile: target }, blocked: false }
}

interface MoveResult {
  readonly units: Units
  readonly blocked: UnitId[]
}

/**
 * One tick of movement for every company at once. Orders are read in a fixed
 * order, so a company that steps off frees its hex for the one behind it — and
 * a company that walks into a hex still held by someone simply stalls there.
 */
function moveTick(units: Units, orders: OrderBook, tick: number): MoveResult {
  const working: Units = { ...units }
  const blocked: UnitId[] = []
  for (const id of UNIT_IDS) {
    const unit = working[id]
    if (unit.models <= 0) continue
    const order = orders[id][tick] ?? 'hold'
    const others = UNIT_IDS.filter((other) => other !== id && working[other].models > 0).map(
      (other) => working[other].tile,
    )
    const result = applyOrder(unit, order, others)
    working[id] = result.unit
    if (result.blocked) blocked.push(id)
  }
  return { units: working, blocked }
}

export interface PreviewStep {
  readonly tile: Hex
  readonly dir: number
  readonly angle: number
  readonly order: OrderType
  readonly blocked: boolean
  readonly tick: number
}

export interface Preview {
  readonly steps: PreviewStep[]
  readonly end: UnitState
  /** How far the company actually travels, so still paths can be dropped. */
  readonly distance: number
  readonly blocked: boolean
}

/**
 * Where every company ends up if the queued orders play out, ignoring combat.
 * Simulated together, so one company's path blocks another's exactly as it
 * will when the round resolves.
 */
export function previewAll(units: Units, orders: OrderBook): Record<UnitId, Preview> {
  const steps = {} as Record<UnitId, PreviewStep[]>
  UNIT_IDS.forEach((id) => {
    steps[id] = []
  })
  let current = units
  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const result = moveTick(current, orders, tick)
    UNIT_IDS.forEach((id) => {
      const order = orders[id][tick]
      if (!order || current[id].models <= 0) return
      const unit = result.units[id]
      steps[id].push({
        tile: unit.tile,
        dir: unit.dir,
        angle: unit.angle,
        order,
        blocked: result.blocked.includes(id),
        tick: tick + 1,
      })
    })
    current = result.units
  }
  const previews = {} as Record<UnitId, Preview>
  UNIT_IDS.forEach((id) => {
    const walk = steps[id]
    previews[id] = {
      steps: walk,
      end: current[id],
      distance: walk.filter(
        (step) => step.tile.q !== units[id].tile.q || step.tile.r !== units[id].tile.r,
      ).length,
      blocked: walk.some((step) => step.blocked),
    }
  })
  return previews
}

/** True when `attacker` sits across one of the defender's three rear edges. */
export function isFlanking(attacker: UnitState, defender: UnitState): boolean {
  const approach = HEX_DIRECTIONS.findIndex((direction) => {
    const neighbour = hexNeighbor(defender.tile, direction)
    return neighbour.q === attacker.tile.q && neighbour.r === attacker.tile.r
  })
  if (approach < 0) return false
  const offset = (((approach - defender.dir) % 6) + 6) % 6
  return offset !== 0 && offset !== 1 && offset !== 5
}

export interface Strike {
  readonly from: UnitId
  readonly to: UnitId
  readonly wounds: number
  readonly removed: number
  readonly flank: boolean
}

export interface Clash {
  readonly player: UnitId
  readonly enemy: UnitId
}

export interface TickFrame {
  readonly tick: number
  readonly afterMove: Units
  readonly afterCombat: Units
  readonly strikes: Strike[]
  readonly clashes: Clash[]
  readonly blocked: UnitId[]
  readonly contact: boolean
}

/** Deliberately soft maths: enough bite to matter, slow enough to watch. */
function strike(attacker: UnitState, defender: UnitState): Strike {
  const flank = isFlanking(attacker, defender)
  const defense = flank ? Math.floor(PIKEMEN.defense / 2) : PIKEMEN.defense
  const wounds = Math.max(0, PIKEMEN.attack * attacker.models - defense * defender.models)
  const removed = wounds > 0 ? Math.max(1, Math.round(wounds / (PIKEMEN.hp * 4))) : 0
  return {
    from: attacker.id,
    to: defender.id,
    wounds,
    removed: Math.min(defender.models, removed),
    flank,
  }
}

/** Every adjacent pair of opposing companies, after this tick's movement. */
function clashesIn(units: Units): Clash[] {
  const pairs: Clash[] = []
  PLAYER_IDS.forEach((player) => {
    if (units[player].models <= 0) return
    ENEMY_IDS.forEach((enemy) => {
      if (units[enemy].models <= 0) return
      if (hexIsAdjacent(units[player].tile, units[enemy].tile)) pairs.push({ player, enemy })
    })
  })
  return pairs
}

/** Resolve a whole round into three frames: movement, then the clash beat. */
export function resolveRound(units: Units, orders: OrderBook): TickFrame[] {
  const frames: TickFrame[] = []
  let current = units
  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const moved = moveTick(current, orders, tick)
    const afterMove = moved.units
    const clashes = clashesIn(afterMove)

    const strikes: Strike[] = []
    clashes.forEach(({ player, enemy }) => {
      strikes.push(strike(afterMove[player], afterMove[enemy]))
      strikes.push(strike(afterMove[enemy], afterMove[player]))
    })

    const losses = {} as Record<UnitId, number>
    UNIT_IDS.forEach((id) => {
      losses[id] = 0
    })
    strikes.forEach((item) => {
      losses[item.to] += item.removed
    })

    const afterCombat = { ...afterMove } as Units
    UNIT_IDS.forEach((id) => {
      const unit = afterMove[id]
      afterCombat[id] = { ...unit, models: Math.max(0, unit.models - losses[id]) }
    })

    frames.push({
      tick: tick + 1,
      afterMove,
      afterCombat,
      strikes,
      clashes,
      blocked: moved.blocked,
      contact: clashes.length > 0,
    })
    current = afterCombat
  }
  return frames
}

const CENTERS = boardTiles().map((tile) => center(tile))
const XS = CENTERS.map((point) => point.x)
const YS = CENTERS.map((point) => point.y)
const VIEW_PAD = HEX_SIZE * 0.7

/** The board's SVG viewBox, with a margin of parchment around the tiles. */
export const BOARD_VIEW = {
  left: Math.min(...XS) - HEX_SIZE - VIEW_PAD,
  top: Math.min(...YS) - HEX_SIZE - VIEW_PAD,
  width: Math.max(...XS) - Math.min(...XS) + HEX_SIZE * 2 + VIEW_PAD * 2,
  height: Math.max(...YS) - Math.min(...YS) + HEX_SIZE * 2 + VIEW_PAD * 2,
}

export const BOARD_RATIO = BOARD_VIEW.width / BOARD_VIEW.height

export const ORDER_LABEL: Record<OrderType, string> = {
  move: 'Advance',
  left: 'Wheel left',
  right: 'Wheel right',
  hold: 'Hold',
}

export const TICK_NUMERAL = ['I', 'II', 'III']
