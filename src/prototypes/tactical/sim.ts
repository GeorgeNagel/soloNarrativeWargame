/**
 * Round resolution: every unit turns, advances in lockstep ticks and turns
 * again, and only then does anything shoot or fight.
 *
 * Implements `docs/combat.md`, `docs/movement.md` and `docs/turn-structure.md`,
 * which adapt the Ancient Wargames Rules in Neil Thomas, *One-Hour Wargames*.
 */
import { hexDistance, hexEquals, hexIsAdjacent, hexNeighbor } from '../../engine'
import type { Hex } from '../../engine'
import {
  HITS_TO_ELIMINATE,
  boardTiles,
  canShoot,
  canShootAt,
  clampTurns,
  hexKey,
  isAlive,
  isRearAttack,
  profileOf,
  turnWheel,
  turnsIn,
  wheel,
} from './model'
import type { OrderBook, OrderPhase, RoundOrder, UnitState } from './model'

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
 * Every engagement at the end of the round: one per face where two enemy units
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
 * Total hits each unit acquires this round, from shooting and melee alike.
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
 * Every shot loosed at the end of the round. A unit that advanced this round
 * may not shoot — the book's *Moving and Shooting* rule. Wheeling is not
 * moving, so a unit may turn onto its target and still loose.
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

/**
 * One of a round's two turn phases: up to three free 60° wheels, taken one
 * after another so the token animates the whole sweep.
 */
export function applyTurns(unit: UnitState, turns: number): UnitState {
  const towards = turnWheel(turns)
  if (!towards) return unit
  let next = unit
  for (let step = 0; step < Math.abs(clampTurns(turns)); step += 1) {
    next = {
      ...next,
      facing: wheel(next.facing, towards),
      angle: next.angle + (towards === 'left' ? -60 : 60),
    }
  }
  return next
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

/** How melee pins a unit, judged on the board as the round opens. */
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

/** One tick of a round's movement: a turn phase, or one hex of the advance. */
export interface MoveTick {
  kind: 'turn' | 'advance'
  /** Which part of the order this tick resolves. */
  phase: OrderPhase
  /** Hex of the advance this tick covers, 1-based. Zero on a turn tick. */
  step: number
  /** The board at the end of this tick. */
  units: UnitState[]
  /** A turn phase nobody used: nothing moved, so playback can skip it. */
  idle: boolean
}

export interface MovePlan {
  /** Turn phase, then one tick per hex of the longest advance, then turn phase. */
  ticks: MoveTick[]
  /** The board the round's shooting and melee are judged on. */
  moved: UnitState[]
  /** Advances refused because the destination hex was held or off-board. */
  blockedIds: string[]
  /** Units whose orders were refused because melee had hold of them. */
  lockedIds: string[]
  /** Units that gave up ground this round, and so may not shoot. */
  advancedIds: Set<string>
}

/**
 * A whole round of movement: every unit takes its turns, then the advances run
 * in lockstep ticks so a unit is blocked by where its neighbours are *now*, and
 * then every unit takes its second set of turns. Nothing shoots or fights until
 * all of that has resolved.
 *
 * The melee lock is judged once, on the board as the round opens: a unit the
 * enemy already has hold of does not advance, and one held frontally does not
 * turn either. A refused order costs nothing — it never happened — while an
 * advance refused for a held hex is still paid for.
 */
export function moveRound(start: UnitState[], orders: OrderBook): MovePlan {
  const locks = new Map(start.map((unit) => [unit.id, meleeLock(unit, start)]))
  const blocked = new Set<string>()
  const locked = new Set<string>()
  const advanced = new Set<string>()
  const budget = new Map<string, number>()

  for (const unit of start) {
    const lock = locks.get(unit.id)!
    const order = orders[unit.id] ?? null
    if (!isAlive(unit) || !order) continue
    const wanted = Math.max(0, order.advance)
    const allowed = lock.engaged ? 0 : Math.min(wanted, profileOf(unit).movement)
    budget.set(unit.id, allowed)
    const turning = order.before !== 0 || order.after !== 0
    if (lock.engaged && (wanted > 0 || (turning && lock.frontally))) locked.add(unit.id)
    if (allowed > 0) advanced.add(unit.id)
  }

  /** A held-frontally unit may not turn at all; a rear-only one may. */
  const turnPhase = (units: UnitState[], phase: OrderPhase): UnitState[] =>
    units.map((unit) => {
      const lock = locks.get(unit.id)!
      if (!isAlive(unit) || (lock.engaged && lock.frontally)) return unit
      const order = orders[unit.id] ?? null
      return order ? applyTurns(unit, turnsIn(order, phase)) : unit
    })

  /** Nothing turned, so the phase is dead air on the board. */
  const nobodyTurned = (before: UnitState[], after: UnitState[]): boolean =>
    after.every((unit, i) => unit.facing === before[i].facing)

  const ticks: MoveTick[] = []
  let units = turnPhase(start, 'before')
  ticks.push({
    kind: 'turn',
    phase: 'before',
    step: 0,
    units,
    idle: nobodyTurned(start, units),
  })

  const longest = Math.max(0, ...budget.values())
  for (let step = 1; step <= longest; step += 1) {
    const next = [...units]
    for (let i = 0; i < next.length; i += 1) {
      const unit = next[i]
      if (!isAlive(unit)) continue
      if ((budget.get(unit.id) ?? 0) < step) continue
      const moved = applyAdvance(unit, occupiedBy(unit, next))
      if (hexKey(moved.pos) === hexKey(unit.pos)) blocked.add(unit.id)
      next[i] = moved
    }
    units = next
    ticks.push({ kind: 'advance', phase: 'advance', step, units, idle: false })
  }

  const turned = turnPhase(units, 'after')
  ticks.push({
    kind: 'turn',
    phase: 'after',
    step: 0,
    units: turned,
    idle: nobodyTurned(units, turned),
  })
  units = turned

  return {
    ticks,
    moved: units,
    blockedIds: [...blocked],
    lockedIds: [...locked],
    advancedIds: advanced,
  }
}

// ── the round ─────────────────────────────────────────────

export interface RoundResult {
  /** Movement, tick by tick, for the playback to walk through. */
  ticks: MoveTick[]
  /** Post-move, pre-combat: the board the fighting is judged on. */
  moved: UnitState[]
  /** Shots loosed once the movement is done, resolved before the melee. */
  shots: Shot[]
  engagements: Engagement[]
  /** The board once shooting and melee have landed. */
  units: UnitState[]
  /** Units whose advance was refused (board edge or an occupied hex). */
  blockedIds: string[]
  /** Units whose orders were refused because melee had hold of them. */
  lockedIds: string[]
  /** Units eliminated by this round's fighting. */
  eliminatedIds: string[]
}

/**
 * Resolve a committed round: all the movement first, then shooting, then melee.
 *
 * Hits from both land together and elimination is checked once, at the end of
 * the round — which is the book's own order of shooting, hand-to-hand, then
 * eliminating units, applied to the round as a whole.
 */
export function resolveRound(
  start: UnitState[],
  orders: OrderBook,
  roll: Roll = d6,
): RoundResult {
  const plan = moveRound(cloned(start), orders)
  const shots = shotsAmong(plan.moved, plan.advancedIds, roll)
  const engagements = engagementsAmong(plan.moved, roll)
  const taken = tallyHits(shots, engagements)

  const units = plan.moved.map((unit) => ({
    ...unit,
    hits: Math.min(HITS_TO_ELIMINATE, unit.hits + (taken.get(unit.id) ?? 0)),
  }))

  return {
    ticks: plan.ticks,
    moved: plan.moved,
    shots,
    engagements,
    units,
    blockedIds: plan.blockedIds,
    lockedIds: plan.lockedIds,
    eliminatedIds: units.filter((unit) => !isAlive(unit)).map((unit) => unit.id),
  }
}

/** The units that walk into the next round: the survivors of this one. */
export function survivors(result: RoundResult): UnitState[] {
  return result.units.filter(isAlive)
}

// ── planning preview ──────────────────────────────────────

export interface Preview {
  order: RoundOrder | null
  /** Hexes the unit passes through, in order, not counting where it starts. */
  path: Hex[]
  /** Where the round leaves the unit, and which way it points there. */
  pos: Hex
  facing: UnitState['facing']
  angle: number
  /** Set when an advance could not be taken (edge of board / occupied). */
  blocked: boolean
  /** Set when melee held the unit and refused its order outright. */
  locked: boolean
  /** Whether the unit gives up ground this round — a unit that does cannot shoot. */
  advanced: boolean
}

export type PreviewMap = Record<string, Preview>

/** Movement ticks a plan is worth watching for: dead turn phases do not count. */
export function plannedTicks(start: UnitState[], orders: OrderBook): number {
  return moveRound(cloned(start), orders).ticks.filter((tick) => !tick.idle).length
}

/**
 * Dry-run of every order-in-progress at once, for the board traces and ghosts.
 *
 * Movement only — combat is rolled, so the preview cannot promise an outcome
 * and does not try to. Running every unit through the same lockstep ticks as
 * `resolveRound` is what lets the preview show one unit shouldering another out
 * of a hex while you are still planning.
 */
export function previewAll(start: UnitState[], orders: OrderBook): PreviewMap {
  const plan = moveRound(cloned(start), orders)
  const blocked = new Set(plan.blockedIds)
  const locked = new Set(plan.lockedIds)
  const previews: PreviewMap = {}

  for (const unit of start) {
    const path: Hex[] = []
    for (const tick of plan.ticks) {
      if (tick.kind !== 'advance') continue
      const at = tick.units.find((candidate) => candidate.id === unit.id)
      if (!at) continue
      const last = path[path.length - 1] ?? unit.pos
      if (!hexEquals(at.pos, last)) path.push(at.pos)
    }
    const end = plan.moved.find((candidate) => candidate.id === unit.id) ?? unit
    previews[unit.id] = {
      order: orders[unit.id] ?? null,
      path,
      pos: end.pos,
      facing: end.facing,
      angle: end.angle,
      blocked: blocked.has(unit.id),
      locked: locked.has(unit.id),
      advanced: plan.advancedIds.has(unit.id),
    }
  }

  return previews
}
