/**
 * A deliberately rough round resolver. Enough fidelity for the UI to feel
 * honest (facing, flank, model loss), no more.
 */
import { hexIsAdjacent, hexNeighbor } from '../../engine'
import type { Hex } from '../../engine'
import { TICKS_PER_ROUND, boardTiles, hexKey, isFlankAttack, wheel } from './model'
import type { OrderKind, OrderSlots, UnitState } from './model'

const LEGAL = new Set(boardTiles().map(hexKey))

export function isOnBoard(tile: Hex): boolean {
  return LEGAL.has(hexKey(tile))
}

export interface ClashEvent {
  attackerId: string
  defenderId: string
  wounds: number
  kills: number
  flank: boolean
}

export interface TickFrame {
  tick: number
  /** Post-move, pre-combat: what the board looks like mid-tick. */
  moved: UnitState[]
  /** Post-combat: what the board looks like at the tick boundary. */
  units: UnitState[]
  clashes: ClashEvent[]
  /** Whether anyone was in contact at this tick boundary. */
  contact: boolean
}

function cloned(units: UnitState[]): UnitState[] {
  return units.map((unit) => ({ ...unit }))
}

/** One order applied to one unit. Blocked moves simply do not happen. */
export function applyOrder(
  unit: UnitState,
  order: OrderKind | null,
  occupied: Set<string>,
): UnitState {
  if (order === 'left' || order === 'right') {
    const facing = wheel(unit.facing, order)
    return { ...unit, facing, angle: unit.angle + (order === 'left' ? -60 : 60) }
  }
  if (order === 'move') {
    const target = hexNeighbor(unit.pos, unit.facing)
    if (!isOnBoard(target) || occupied.has(hexKey(target))) return unit
    return { ...unit, pos: target }
  }
  return unit
}

function fight(units: UnitState[]): { units: UnitState[]; clashes: ClashEvent[] } {
  const clashes: ClashEvent[] = []
  const losses = new Map<string, number>()

  for (const attacker of units) {
    for (const defender of units) {
      if (attacker.side === defender.side) continue
      if (!hexIsAdjacent(attacker.pos, defender.pos)) continue
      const flank = isFlankAttack(defender, attacker.pos)
      const defense = flank ? Math.floor(defender.stats.defense / 2) : defender.stats.defense
      const wounds = Math.max(
        0,
        attacker.stats.attack * attacker.models - defense * defender.models,
      )
      const kills = Math.min(defender.models, Math.floor(wounds / defender.stats.hp))
      clashes.push({
        attackerId: attacker.id,
        defenderId: defender.id,
        wounds,
        kills,
        flank,
      })
      losses.set(defender.id, (losses.get(defender.id) ?? 0) + kills)
    }
  }

  return {
    units: units.map((unit) => ({
      ...unit,
      models: Math.max(0, unit.models - (losses.get(unit.id) ?? 0)),
    })),
    clashes,
  }
}

/** Resolve a committed round into one frame per tick. */
export function resolveRound(
  start: UnitState[],
  orders: Record<string, OrderSlots>,
): TickFrame[] {
  const frames: TickFrame[] = []
  let current = cloned(start)

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const moved: UnitState[] = []
    for (const unit of current) {
      const occupied = new Set(
        [...moved, ...current.filter((other) => !moved.some((m) => m.id === other.id))]
          .filter((other) => other.id !== unit.id && other.models > 0)
          .map((other) => hexKey(other.pos)),
      )
      moved.push(applyOrder(unit, orders[unit.id]?.[tick] ?? null, occupied))
    }
    const resolved = fight(moved)
    frames.push({
      tick,
      moved,
      units: resolved.units,
      clashes: resolved.clashes,
      contact: resolved.clashes.length > 0,
    })
    current = resolved.units
  }

  return frames
}

export interface PreviewStep {
  tick: number
  pos: Hex
  facing: UnitState['facing']
  angle: number
  order: OrderKind | null
  /** Set when an `ADV` could not be taken (edge of board / occupied). */
  blocked: boolean
}

/** Dry-run of a queue-in-progress, for the board ghost + trace. */
export function previewPath(
  unit: UnitState,
  slots: OrderSlots,
  others: UnitState[],
): PreviewStep[] {
  const blockers = new Set(
    others.filter((other) => other.id !== unit.id).map((other) => hexKey(other.pos)),
  )
  const steps: PreviewStep[] = []
  let cursor: UnitState = { ...unit }

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const order = slots[tick] ?? null
    const before = cursor
    cursor = applyOrder(cursor, order, blockers)
    steps.push({
      tick,
      pos: cursor.pos,
      facing: cursor.facing,
      angle: cursor.angle,
      order,
      blocked: order === 'move' && before.pos === cursor.pos,
    })
  }
  return steps
}

