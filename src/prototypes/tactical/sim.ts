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
  /** Units whose ADV was refused this tick (board edge or an occupied hex). */
  blockedIds: string[]
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

/**
 * Hexes `unit` may not enter this tick. Units move in roster order, so a unit
 * is blocked by those that already moved and by those still waiting their turn.
 */
function blockedHexes(unit: UnitState, moved: UnitState[], pending: UnitState[]): Set<string> {
  const done = new Set(moved.map((other) => other.id))
  const standing = [...moved, ...pending.filter((other) => !done.has(other.id))]
  return new Set(
    standing
      .filter((other) => other.id !== unit.id && other.models > 0)
      .map((other) => hexKey(other.pos)),
  )
}

function fight(units: UnitState[]): { units: UnitState[]; clashes: ClashEvent[] } {
  const clashes: ClashEvent[] = []
  const losses = new Map<string, number>()

  for (const attacker of units) {
    if (attacker.models <= 0) continue
    for (const defender of units) {
      if (attacker.side === defender.side || defender.models <= 0) continue
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
    const blockedIds: string[] = []
    for (const unit of current) {
      const order = orders[unit.id]?.[tick] ?? null
      const next = applyOrder(unit, order, blockedHexes(unit, moved, current))
      if (order === 'move' && hexKey(next.pos) === hexKey(unit.pos)) blockedIds.push(unit.id)
      moved.push(next)
    }
    const resolved = fight(moved)
    frames.push({
      tick,
      moved,
      units: resolved.units,
      clashes: resolved.clashes,
      blockedIds,
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

export type PreviewMap = Record<string, PreviewStep[]>

/**
 * Dry-run of every queue-in-progress at once, for the board traces and ghosts.
 *
 * Running all six units through the same loop as `resolveRound` (minus the
 * fighting) is what lets the preview show one friendly unit shouldering another
 * out of a hex — the blocked badge appears while you are still planning.
 */
export function previewAll(start: UnitState[], orders: Record<string, OrderSlots>): PreviewMap {
  const steps: PreviewMap = {}
  for (const unit of start) steps[unit.id] = []
  let current = cloned(start)

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const moved: UnitState[] = []
    for (const unit of current) {
      const order = orders[unit.id]?.[tick] ?? null
      const next = applyOrder(unit, order, blockedHexes(unit, moved, current))
      moved.push(next)
      steps[unit.id].push({
        tick,
        pos: next.pos,
        facing: next.facing,
        angle: next.angle,
        order,
        blocked: order === 'move' && hexKey(next.pos) === hexKey(unit.pos),
      })
    }
    current = moved
  }
  return steps
}

