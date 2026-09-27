/**
 * Round resolution: movement in lockstep sub-steps, then one mutual engagement
 * per contacted face at each tick boundary.
 *
 * Implements `docs/combat.md`, `docs/movement.md` and `docs/turn-structure.md`,
 * which adapt the Ancient Wargames Rules in Neil Thomas, *One-Hour Wargames*.
 */
import { hexIsAdjacent, hexNeighbor } from '../../engine'
import type { Hex } from '../../engine'
import {
  HITS_TO_ELIMINATE,
  MAX_ADVANCES_PER_TICK,
  TICKS_PER_ROUND,
  boardTiles,
  hexKey,
  isAlive,
  isRearAttack,
  profileOf,
  wheel,
} from './model'
import type { OrderSlots, TickOrder, UnitState } from './model'

const LEGAL = new Set(boardTiles().map(hexKey))

export function isOnBoard(tile: Hex): boolean {
  return LEGAL.has(hexKey(tile))
}

/** A source of d6 results. Injected so rounds can be replayed in tests. */
export type Roll = () => number

export const d6: Roll = () => Math.floor(Math.random() * 6) + 1

// ── combat ────────────────────────────────────────────────

/** One side's contribution to an engagement. */
export interface Blow {
  /** The raw d6 before the unit's type modifier. */
  roll: number
  /** Hits mandated by the roll and the type modifier, before target modifiers. */
  mandated: number
  /** Hits the target actually acquires. */
  hits: number
  /** Whether this blow landed on the target's rear arc. */
  rear: boolean
  /** Whether the target's armour halved the mandated hits. */
  armoured: boolean
}

/**
 * Hits `attacker` inflicts on `defender`, per `docs/combat.md`: the modified
 * d6 is halved by the target's armour, then doubled for a rear attack, with
 * fractions rounded in favour of the attacking unit.
 */
export function assessBlow(attacker: UnitState, defender: UnitState, roll: number): Blow {
  const mandated = Math.max(0, roll + profileOf(attacker).meleeModifier)
  const armoured = profileOf(defender).armoured
  const rear = isRearAttack(defender, attacker.pos)

  let hits = mandated
  if (armoured) hits = Math.ceil(hits / 2)
  if (rear) hits *= 2

  return { roll, mandated, hits, rear, armoured }
}

/**
 * One fight across one shared face. Both sides roll and both results apply —
 * a unit eliminated here still lands its own blow, so there is no first strike.
 */
export interface Engagement {
  aId: string
  bId: string
  /** What `a` does to `b`. */
  a: Blow
  /** What `b` does to `a`. */
  b: Blow
}

/**
 * Every engagement at this tick boundary: one per face where two enemy units
 * touch. Pairs are keyed by id so a face is never fought twice.
 */
export function engagementsAmong(units: UnitState[], roll: Roll): Engagement[] {
  const engagements: Engagement[] = []
  const live = units.filter(isAlive)

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i]
      const b = live[j]
      if (a.side === b.side) continue
      if (!hexIsAdjacent(a.pos, b.pos)) continue
      engagements.push({
        aId: a.id,
        bId: b.id,
        a: assessBlow(a, b, roll()),
        b: assessBlow(b, a, roll()),
      })
    }
  }

  return engagements
}

/** Total hits each unit acquires from a tick's engagements. */
function tallyHits(engagements: Engagement[]): Map<string, number> {
  const taken = new Map<string, number>()
  for (const fight of engagements) {
    taken.set(fight.bId, (taken.get(fight.bId) ?? 0) + fight.a.hits)
    taken.set(fight.aId, (taken.get(fight.aId) ?? 0) + fight.b.hits)
  }
  return taken
}

// ── movement ──────────────────────────────────────────────

function cloned(units: UnitState[]): UnitState[] {
  return units.map((unit) => ({ ...unit }))
}

/** The free 60° wheel at the head of a tick's order. */
export function applyWheel(unit: UnitState, order: TickOrder | null): UnitState {
  if (!order?.wheel) return unit
  return {
    ...unit,
    facing: wheel(unit.facing, order.wheel),
    angle: unit.angle + (order.wheel === 'left' ? -60 : 60),
  }
}

/** One advance into the faced hex. A refused advance still spends the allowance. */
export function applyAdvance(unit: UnitState, occupied: Set<string>): UnitState {
  const target = hexNeighbor(unit.pos, unit.facing)
  if (!isOnBoard(target) || occupied.has(hexKey(target))) return unit
  return { ...unit, pos: target }
}

/** Advances this unit takes in `tick`, capped by its remaining allowance. */
function advancesAt(unit: UnitState, slots: OrderSlots, tick: number): number {
  const allowance = profileOf(unit).movement
  let spentBefore = 0
  for (let i = 0; i < tick; i += 1) spentBefore += slots[i]?.advances ?? 0
  const wanted = Math.min(slots[tick]?.advances ?? 0, MAX_ADVANCES_PER_TICK)
  return Math.max(0, Math.min(wanted, allowance - spentBefore))
}

/** Hexes held by everyone but `unit`, as of the given board state. */
function occupiedBy(unit: UnitState, units: UnitState[]): Set<string> {
  return new Set(
    units
      .filter((other) => other.id !== unit.id && isAlive(other))
      .map((other) => hexKey(other.pos)),
  )
}

/**
 * One tick of movement: everyone wheels, then advances in lockstep sub-steps so
 * a unit is blocked by where its neighbours are *now*, not where they started.
 */
function moveTick(
  start: UnitState[],
  orders: Record<string, OrderSlots>,
  tick: number,
): { units: UnitState[]; blockedIds: string[] } {
  let units = start.map((unit) => applyWheel(unit, orders[unit.id]?.[tick] ?? null))
  const blocked = new Set<string>()

  for (let step = 0; step < MAX_ADVANCES_PER_TICK; step += 1) {
    const next = [...units]
    for (let i = 0; i < next.length; i += 1) {
      const unit = next[i]
      if (!isAlive(unit)) continue
      if (advancesAt(unit, orders[unit.id] ?? [], tick) <= step) continue
      const moved = applyAdvance(unit, occupiedBy(unit, next))
      if (hexKey(moved.pos) === hexKey(unit.pos)) blocked.add(unit.id)
      next[i] = moved
    }
    units = next
  }

  return { units, blockedIds: [...blocked] }
}

// ── the round ─────────────────────────────────────────────

export interface TickFrame {
  tick: number
  /** Post-move, pre-combat: what the board looks like mid-tick. */
  moved: UnitState[]
  /** Post-combat: what the board looks like at the tick boundary. */
  units: UnitState[]
  engagements: Engagement[]
  /** Units whose advance was refused this tick (board edge or an occupied hex). */
  blockedIds: string[]
  /** Units eliminated at this tick boundary. */
  eliminatedIds: string[]
}

/** Resolve a committed round into one frame per tick. */
export function resolveRound(
  start: UnitState[],
  orders: Record<string, OrderSlots>,
  roll: Roll = d6,
): TickFrame[] {
  const frames: TickFrame[] = []
  let current = cloned(start)

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const { units: moved, blockedIds } = moveTick(current, orders, tick)
    const engagements = engagementsAmong(moved, roll)
    const taken = tallyHits(engagements)

    const units = moved.map((unit) => ({
      ...unit,
      hits: Math.min(HITS_TO_ELIMINATE, unit.hits + (taken.get(unit.id) ?? 0)),
    }))

    frames.push({
      tick,
      moved,
      units,
      engagements,
      blockedIds,
      eliminatedIds: units.filter((unit) => !isAlive(unit)).map((unit) => unit.id),
    })
    current = units
  }

  return frames
}

/** The units that walk into the next round: the survivors of the last tick. */
export function survivors(frames: TickFrame[]): UnitState[] {
  const last = frames[frames.length - 1]
  return last ? last.units.filter(isAlive) : []
}

// ── planning preview ──────────────────────────────────────

export interface PreviewStep {
  tick: number
  pos: Hex
  facing: UnitState['facing']
  angle: number
  order: TickOrder | null
  /** Set when an advance could not be taken (edge of board / occupied). */
  blocked: boolean
}

export type PreviewMap = Record<string, PreviewStep[]>

/**
 * Dry-run of every queue-in-progress at once, for the board traces and ghosts.
 *
 * Movement only — combat is rolled, so the preview cannot promise an outcome
 * and does not try to. Running every unit through the same lockstep loop as
 * `resolveRound` is what lets the preview show one unit shouldering another out
 * of a hex while you are still planning.
 */
export function previewAll(
  start: UnitState[],
  orders: Record<string, OrderSlots>,
): PreviewMap {
  const steps: PreviewMap = {}
  for (const unit of start) steps[unit.id] = []
  let current = cloned(start)

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const { units, blockedIds } = moveTick(current, orders, tick)
    const refused = new Set(blockedIds)
    for (const unit of units) {
      steps[unit.id].push({
        tick,
        pos: unit.pos,
        facing: unit.facing,
        angle: unit.angle,
        order: orders[unit.id]?.[tick] ?? null,
        blocked: refused.has(unit.id),
      })
    }
    current = units
  }

  return steps
}
