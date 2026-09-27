/**
 * Round resolution: movement in lockstep sub-steps, then one mutual engagement
 * per contacted face at each tick boundary.
 *
 * Implements `docs/combat.md`, `docs/movement.md` and `docs/turn-structure.md`,
 * which adapt the Ancient Wargames Rules in Neil Thomas, *One-Hour Wargames*.
 */
import { hexDistance, hexIsAdjacent, hexNeighbor } from '../../engine'
import type { Hex } from '../../engine'
import {
  HITS_TO_ELIMINATE,
  MAX_ADVANCES_PER_TICK,
  TICKS_PER_ROUND,
  boardTiles,
  canShoot,
  canShootAt,
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

/**
 * Total hits each unit acquires this tick, from shooting and melee alike.
 *
 * Both land together and elimination is checked afterwards, which is the
 * book's own order: shooting, then hand-to-hand, then eliminating units.
 */
function tallyHits(shots: Shot[], engagements: Engagement[]): Map<string, number> {
  const taken = new Map<string, number>()
  const add = (id: string, hits: number) => taken.set(id, (taken.get(id) ?? 0) + hits)
  for (const shot of shots) add(shot.targetId, shot.hits)
  for (const fight of engagements) {
    add(fight.bId, fight.a.hits)
    add(fight.aId, fight.b.hits)
  }
  return taken
}

// ── shooting ──────────────────────────────────────────────

/** One unit's shot at one target. */
export interface Shot {
  shooterId: string
  targetId: string
  /** The raw d6 before the shooter's type modifier. */
  roll: number
  /** Hits mandated by the roll and the type modifier, before target modifiers. */
  mandated: number
  /** Hits the target actually acquires. */
  hits: number
  /** Whether the target's armour halved the mandated hits. */
  armoured: boolean
}

/**
 * Hits a shot inflicts, per `docs/shooting.md`: the modified d6, halved by the
 * target's armour with the fraction rounded in favour of the unit shooting.
 *
 * There is no rear bonus for shooting — the book gives that to melee only.
 */
export function assessShot(
  shooter: UnitState,
  target: UnitState,
  roll: number,
): Omit<Shot, 'shooterId' | 'targetId'> {
  const modifier = profileOf(shooter).shootModifier ?? 0
  const mandated = Math.max(0, roll + modifier)
  const armoured = profileOf(target).armoured
  return {
    roll,
    mandated,
    hits: armoured ? Math.ceil(mandated / 2) : mandated,
    armoured,
  }
}

/**
 * The single target this unit shoots at: the nearest enemy in range and inside
 * the field of fire, ties broken by roster order so a round replays the same
 * way. The book lets the player choose; here the choice is made by where you
 * point the unit, since wheeling is free and shooting needs a tick without an
 * advance.
 */
export function shootingTarget(shooter: UnitState, units: UnitState[]): UnitState | null {
  let best: UnitState | null = null
  let bestRange = Infinity
  for (const other of units) {
    if (other.side === shooter.side || !isAlive(other)) continue
    if (!canShootAt(shooter, other.pos)) continue
    const range = hexDistance(shooter.pos, other.pos)
    if (range < bestRange) {
      best = other
      bestRange = range
    }
  }
  return best
}

/**
 * Every shot taken at this tick boundary. A unit that advanced this tick may
 * not shoot — the book's *Moving and Shooting* rule. Wheeling is not moving,
 * so a unit may turn onto its target and still loose.
 */
export function shotsAmong(
  units: UnitState[],
  advancedIds: Set<string>,
  roll: Roll,
): Shot[] {
  const shots: Shot[] = []
  for (const shooter of units) {
    if (!isAlive(shooter) || !canShoot(shooter)) continue
    if (advancedIds.has(shooter.id)) continue
    const target = shootingTarget(shooter, units)
    if (!target) continue
    shots.push({
      shooterId: shooter.id,
      targetId: target.id,
      ...assessShot(shooter, target, roll()),
    })
  }
  return shots
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

/** Hexes held by everyone but `unit`, as of the given board state. */
function occupiedBy(unit: UnitState, units: UnitState[]): Set<string> {
  return new Set(
    units
      .filter((other) => other.id !== unit.id && isAlive(other))
      .map((other) => hexKey(other.pos)),
  )
}

/** How melee pins a unit, judged on the board as a tick opens. */
export interface MeleeLock {
  /** Adjacent to at least one living enemy. */
  engaged: boolean
  /** At least one of those enemies sits across a front edge. */
  frontally: boolean
}

/**
 * The book's *Movement Within Combat*: hand-to-hand only concludes with the
 * elimination of one side, so an engaged unit may not walk away. It may turn to
 * meet an attack on its rear, but not while it is also held frontally.
 */
export function meleeLock(unit: UnitState, units: UnitState[]): MeleeLock {
  let engaged = false
  let frontally = false
  for (const other of units) {
    if (other.side === unit.side || !isAlive(other)) continue
    if (!hexIsAdjacent(unit.pos, other.pos)) continue
    engaged = true
    if (!isRearAttack(unit, other.pos)) frontally = true
  }
  return { engaged, frontally }
}

export interface MoveResult {
  units: UnitState[]
  /** Advances refused because the destination hex was held or off-board. */
  blockedIds: string[]
  /** Units whose orders were refused because melee had hold of them. */
  lockedIds: string[]
  /** Units that spent this tick moving, and so may not shoot. */
  advancedIds: Set<string>
}

/**
 * One tick of movement: everyone wheels, then advances in lockstep sub-steps so
 * a unit is blocked by where its neighbours are *now*, not where they started.
 *
 * `spent` carries each unit's used allowance across the ticks of a round and is
 * updated in place. A locked unit spends nothing — its order never happened —
 * while an advance refused for a held hex is still paid for.
 */
function moveTick(
  start: UnitState[],
  orders: Record<string, OrderSlots>,
  tick: number,
  spent: Map<string, number>,
): MoveResult {
  // The lock is judged before anyone moves, so a tick resolves against the
  // engagements that existed when it opened.
  const locks = new Map(start.map((unit) => [unit.id, meleeLock(unit, start)]))
  const blocked = new Set<string>()
  const locked = new Set<string>()
  const advanced = new Set<string>()
  const budget = new Map<string, number>()

  for (const unit of start) {
    if (!isAlive(unit)) continue
    const lock = locks.get(unit.id)!
    const order = orders[unit.id]?.[tick] ?? null
    const wanted = Math.min(order?.advances ?? 0, MAX_ADVANCES_PER_TICK)
    const left = profileOf(unit).movement - (spent.get(unit.id) ?? 0)
    const allowed = lock.engaged ? 0 : Math.max(0, Math.min(wanted, left))
    budget.set(unit.id, allowed)
    if (lock.engaged && (wanted > 0 || (order?.wheel != null && lock.frontally))) {
      locked.add(unit.id)
    }
    if (allowed > 0) advanced.add(unit.id)
  }

  let units = start.map((unit) => {
    const lock = locks.get(unit.id)!
    // held frontally: no turning at all. Held only from behind: turn to face it.
    if (lock.engaged && lock.frontally) return unit
    return applyWheel(unit, orders[unit.id]?.[tick] ?? null)
  })

  for (let step = 0; step < MAX_ADVANCES_PER_TICK; step += 1) {
    const next = [...units]
    for (let i = 0; i < next.length; i += 1) {
      const unit = next[i]
      if (!isAlive(unit)) continue
      if ((budget.get(unit.id) ?? 0) <= step) continue
      const moved = applyAdvance(unit, occupiedBy(unit, next))
      if (hexKey(moved.pos) === hexKey(unit.pos)) blocked.add(unit.id)
      next[i] = moved
    }
    units = next
  }

  for (const unit of start) {
    spent.set(unit.id, (spent.get(unit.id) ?? 0) + (budget.get(unit.id) ?? 0))
  }

  return {
    units,
    blockedIds: [...blocked],
    lockedIds: [...locked],
    advancedIds: advanced,
  }
}

// ── the round ─────────────────────────────────────────────

export interface TickFrame {
  tick: number
  /** Post-move, pre-combat: what the board looks like mid-tick. */
  moved: UnitState[]
  /** Post-combat: what the board looks like at the tick boundary. */
  units: UnitState[]
  /** Shots loosed at this tick boundary, resolved before the melee. */
  shots: Shot[]
  engagements: Engagement[]
  /** Units whose advance was refused this tick (board edge or an occupied hex). */
  blockedIds: string[]
  /** Units whose orders were refused this tick because melee had hold of them. */
  lockedIds: string[]
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
  const spent = new Map<string, number>()

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const { units: moved, blockedIds, lockedIds, advancedIds } = moveTick(
      current,
      orders,
      tick,
      spent,
    )
    const shots = shotsAmong(moved, advancedIds, roll)
    const engagements = engagementsAmong(moved, roll)
    const taken = tallyHits(shots, engagements)

    const units = moved.map((unit) => ({
      ...unit,
      hits: Math.min(HITS_TO_ELIMINATE, unit.hits + (taken.get(unit.id) ?? 0)),
    }))

    frames.push({
      tick,
      moved,
      units,
      shots,
      engagements,
      blockedIds,
      lockedIds,
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
  /** Set when melee held the unit and refused its order outright. */
  locked: boolean
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
  const spent = new Map<string, number>()

  for (let tick = 0; tick < TICKS_PER_ROUND; tick += 1) {
    const { units, blockedIds, lockedIds } = moveTick(current, orders, tick, spent)
    const refused = new Set(blockedIds)
    const held = new Set(lockedIds)
    for (const unit of units) {
      steps[unit.id].push({
        tick,
        pos: unit.pos,
        facing: unit.facing,
        angle: unit.angle,
        order: orders[unit.id]?.[tick] ?? null,
        blocked: refused.has(unit.id),
        locked: held.has(unit.id),
      })
    }
    current = units
  }

  return steps
}
