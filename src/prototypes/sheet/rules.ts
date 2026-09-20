import {
  HEX_DIRECTIONS,
  hex,
  hexDistance,
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
export type UnitId = 'player' | 'enemy'

export interface UnitState {
  readonly id: UnitId
  readonly name: string
  readonly tile: Hex
  /** Index into HEX_DIRECTIONS. */
  readonly dir: number
  /** Continuous screen angle in degrees, so turns animate the short way round. */
  readonly angle: number
  readonly models: number
}

export type Units = Record<UnitId, UnitState>

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

export const INITIAL_UNITS: Units = {
  // Bottom row, centre column, facing up-and-right toward the enemy line.
  player: { id: 'player', name: 'Your pikemen', tile: hex(0, 6), dir: 1, angle: angleOf(1), models: 20 },
  // Top row, centre column, facing down-and-left toward the player.
  enemy: { id: 'enemy', name: 'Enemy pikemen', tile: hex(3, 0), dir: 4, angle: angleOf(4), models: 20 },
}

export const emptySlots = (): Slots => [null, null, null]
export const holdSlots = (): Slots => ['hold', 'hold', 'hold']

export function assignedCount(slots: Slots): number {
  return slots.filter((slot) => slot !== null).length
}

export function slotsComplete(slots: Slots): boolean {
  return assignedCount(slots) === TICKS_PER_ROUND
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
}

/** Where a unit ends up if its queued orders play out, ignoring combat. */
export function previewOrders(unit: UnitState, slots: Slots, others: Hex[]): Preview {
  const steps: PreviewStep[] = []
  let current = unit
  slots.forEach((order, index) => {
    if (!order) return
    const result = applyOrder(current, order, others)
    current = result.unit
    steps.push({
      tile: current.tile,
      dir: current.dir,
      angle: current.angle,
      order,
      blocked: result.blocked,
      tick: index + 1,
    })
  })
  return { steps, end: current }
}

/** True when `attacker` sits across one of the defender's three rear edges. */
export function isFlanking(attacker: UnitState, defender: UnitState): boolean {
  const approach = HEX_DIRECTIONS.findIndex((direction) => {
    const neighbour = hexNeighbor(defender.tile, direction)
    return neighbour.q === attacker.tile.q && neighbour.r === attacker.tile.r
  })
  if (approach < 0) return false
  const offset = ((approach - defender.dir) % 6 + 6) % 6
  return offset !== 0 && offset !== 1 && offset !== 5
}

export interface Strike {
  readonly from: UnitId
  readonly to: UnitId
  readonly wounds: number
  readonly removed: number
  readonly flank: boolean
}

export interface TickFrame {
  readonly tick: number
  readonly afterMove: Units
  readonly afterCombat: Units
  readonly strikes: Strike[]
  readonly contact: boolean
}

function strike(attacker: UnitState, defender: UnitState): Strike {
  const flank = isFlanking(attacker, defender)
  const defense = flank ? Math.floor(PIKEMEN.defense / 2) : PIKEMEN.defense
  const wounds = Math.max(0, PIKEMEN.attack * attacker.models - defense * defender.models)
  return {
    from: attacker.id,
    to: defender.id,
    wounds,
    removed: Math.min(defender.models, Math.floor(wounds / PIKEMEN.hp)),
    flank,
  }
}

/** Resolve a whole round into three frames: movement, then the clash beat. */
export function resolveRound(units: Units, orders: Record<UnitId, Slots>): TickFrame[] {
  const frames: TickFrame[] = []
  let current = units
  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const playerOrder = orders.player[tick] ?? 'hold'
    const enemyOrder = orders.enemy[tick] ?? 'hold'
    const player = current.player.models > 0
      ? applyOrder(current.player, playerOrder, [current.enemy.tile]).unit
      : current.player
    const enemy = current.enemy.models > 0
      ? applyOrder(current.enemy, enemyOrder, [current.player.tile, player.tile]).unit
      : current.enemy
    const afterMove: Units = { player, enemy }

    const contact =
      player.models > 0 && enemy.models > 0 && hexDistance(player.tile, enemy.tile) === 1
    const strikes: Strike[] = contact ? [strike(player, enemy), strike(enemy, player)] : []
    const losses: Record<UnitId, number> = { player: 0, enemy: 0 }
    strikes.forEach((item) => {
      losses[item.to] += item.removed
    })
    const afterCombat: Units = {
      player: { ...player, models: Math.max(0, player.models - losses.player) },
      enemy: { ...enemy, models: Math.max(0, enemy.models - losses.enemy) },
    }

    frames.push({ tick: tick + 1, afterMove, afterCombat, strikes, contact })
    current = afterCombat
  }
  return frames
}

const CENTERS = boardTiles().map((tile) => center(tile))
const XS = CENTERS.map((point) => point.x)
const YS = CENTERS.map((point) => point.y)
const VIEW_PAD = HEX_SIZE * 0.9

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
