/**
 * What a decision tree is allowed to look at.
 *
 * Two feature spaces: one the army tree sees once a round, and one each unit
 * tree sees per unit. Both are flat `number` records keyed by the names below,
 * and every key carries a range so mutation can sample a sensible threshold
 * and jitter it without drifting off the useful part of the scale.
 */
import { HEX_DIRECTIONS, hexDistance, hexEquals, hexNeighbor } from '../engine'
import type { Hex, HexDirection } from '../engine'
import {
  HITS_TO_ELIMINATE,
  MAX_TURNS_PER_PHASE,
  angleBetween,
  bearingBetween,
  canShoot,
  canShootAt,
  facingAngle,
  isAlive,
  movementOf,
  profileOf,
} from '../prototypes/tactical/model'
import type { Side, UnitState } from '../prototypes/tactical/model'
import { isOnBoard, meleeLock } from '../prototypes/tactical/sim'
import type { Objective } from './scenario'

/** A number a tree may branch on, with the range its thresholds are drawn from. */
export interface FeatureSpec {
  key: string
  /** Inclusive low end of the useful threshold range. */
  min: number
  /** Inclusive high end. */
  max: number
  /** Thresholds snap to this, so a branch never splits between two whole hexes. */
  step: number
}

export type Features = Record<string, number>

function spec(key: string, min: number, max: number, step = 1): FeatureSpec {
  return { key, min, max, step }
}

/** The number of postures the army tree may choose between. */
export const POSTURE_COUNT = 4

/**
 * Ranges in hexes are split no further out than this, and it stands in for the
 * range to an enemy that is not there. It covers the gap between two armies as
 * they deploy on the board, with room to spare.
 */
export const FAR = 16

/**
 * Per-unit features. Everything is either a count, a distance in hexes, a
 * signed count of 60° wheels, or a 0/1 flag, so thresholds read as tactics.
 */
export const UNIT_FEATURE_SPECS: readonly FeatureSpec[] = [
  // the posture the army tree picked this round; it carries no fixed meaning,
  // it is a channel the two levels of the genome may learn to agree on
  spec('posture', 0, POSTURE_COUNT - 1),
  spec('round', 1, 30),
  // 1 when this side is the scenario's attacker, 0 when it defends
  spec('attacking', 0, 1),
  // 1 when the objective is a deathmatch, 0 when it is hold
  spec('deathmatch', 0, 1),
  // this unit
  spec('ownDamage', 0, 1, 0.1),
  spec('allowance', 2, 4),
  spec('canShoot', 0, 1),
  spec('engaged', 0, 1),
  spec('heldFrontally', 0, 1),
  spec('heldOnRearOnly', 0, 1),
  spec('adjacentEnemies', 0, 6),
  spec('adjacentFriends', 0, 6),
  spec('hexesAhead', 0, 4),
  // the nearest living enemy
  spec('foeRange', 1, FAR),
  spec('foeWheels', -MAX_TURNS_PER_PHASE, MAX_TURNS_PER_PHASE),
  spec('foeWheelsAbs', 0, MAX_TURNS_PER_PHASE),
  spec('foeDamage', 0, 1, 0.1),
  spec('foeArmoured', 0, 1),
  spec('foeMelee', -2, 2),
  spec('foeFacesMe', 0, 1),
  spec('foeRearOpen', 0, 1),
  spec('foeCanShoot', 0, 1),
  // pressure and shooting
  spec('roundsToContact', -4, FAR),
  spec('shootTargets', 0, 6),
  spec('shootRange', 0, 4),
  spec('shootWheels', -MAX_TURNS_PER_PHASE, MAX_TURNS_PER_PHASE),
  // the armies
  spec('friendsAlive', 1, 10),
  spec('foesAlive', 1, 10),
  spec('strengthRatio', 0, 1, 0.1),
]

/** Army-level features, read once a round to pick the posture. */
export const ARMY_FEATURE_SPECS: readonly FeatureSpec[] = [
  spec('round', 1, 30),
  spec('attacking', 0, 1),
  spec('deathmatch', 0, 1),
  spec('friendsAlive', 1, 10),
  spec('foesAlive', 1, 10),
  spec('ownStrength', 0, 1, 0.1),
  spec('foeStrength', 0, 1, 0.1),
  spec('strengthRatio', 0, 1, 0.1),
  spec('contacts', 0, 10),
  spec('closestRange', 1, FAR),
  spec('meanRange', 1, FAR, 0.5),
  spec('ownShooters', 0, 10),
  spec('foeShooters', 0, 10),
  spec('ownFast', 0, 10),
]

// ── geometry helpers ──────────────────────────────────────

/** The faced edge that points most nearly at `target`. */
export function edgeToward(from: Hex, target: Hex): HexDirection | null {
  if (hexEquals(from, target)) return null
  const bearing = bearingBetween(from, target)
  let best: HexDirection = HEX_DIRECTIONS[0]
  let bestOff = Infinity
  for (const direction of HEX_DIRECTIONS) {
    const off = angleBetween(facingAngle(direction), bearing)
    if (off < bestOff) {
      best = direction
      bestOff = off
    }
  }
  return best
}

/**
 * Signed 60° wheels that bring `facing` onto `direction` — negative to the
 * left, positive to the right, matching a `RoundOrder`'s turn phases.
 */
export function wheelsBetween(facing: HexDirection, direction: HexDirection): number {
  const count = HEX_DIRECTIONS.length
  const from = HEX_DIRECTIONS.indexOf(facing)
  const to = HEX_DIRECTIONS.indexOf(direction)
  // `HEX_DIRECTIONS` runs counter-clockwise, so a left wheel steps forward in it
  const left = (to - from + count) % count
  const right = (from - to + count) % count
  if (left === 0) return 0
  return left <= right ? -left : right
}

/** Signed wheels that point `unit` as nearly as it can at `target`. */
export function wheelsToward(unit: UnitState, target: Hex): number {
  const direction = edgeToward(unit.pos, target)
  return direction ? wheelsBetween(unit.facing, direction) : 0
}

/**
 * Whether `pos` lies in `defender`'s rear arc, generalised to any distance by
 * taking the edge the bearing points at. For adjacent hexes this agrees with
 * the combat rule in `isRearAttack`; further out it is an estimate, and it is
 * only ever used as a feature, never to assess a blow.
 */
export function inRearArc(defender: UnitState, pos: Hex): boolean {
  const edge = edgeToward(defender.pos, pos)
  if (!edge) return false
  const count = HEX_DIRECTIONS.length
  const a = HEX_DIRECTIONS.indexOf(edge)
  const b = HEX_DIRECTIONS.indexOf(defender.facing)
  const spread = Math.min((a - b + count) % count, (b - a + count) % count)
  return spread > 1
}

/** Remaining strength of a side, as a fraction of what it started with. */
export function strengthOf(units: UnitState[], side: Side, roster: number): number {
  if (roster <= 0) return 0
  let left = 0
  for (const unit of units) {
    if (unit.side !== side || !isAlive(unit)) continue
    left += (HITS_TO_ELIMINATE - unit.hits) / HITS_TO_ELIMINATE
  }
  return left / roster
}

/** Hexes this unit could advance before the board edge or a held hex stops it. */
function hexesAhead(unit: UnitState, units: UnitState[]): number {
  const held = new Set<string>()
  for (const other of units) {
    if (other.id === unit.id || !isAlive(other)) continue
    held.add(`${other.pos.q},${other.pos.r}`)
  }
  let at = unit.pos
  let clear = 0
  for (let step = 0; step < movementOf(unit); step += 1) {
    at = hexNeighbor(at, unit.facing)
    if (!isOnBoard(at) || held.has(`${at.q},${at.r}`)) break
    clear += 1
  }
  return clear
}

/** What the caller already knows about the round, so it is not recomputed. */
export interface FeatureContext {
  round: number
  posture: number
  /** How many units each side deployed, for the strength fractions. */
  roster: Record<Side, number>
  /** The side the objective asks to break the other; ties go to the defender. */
  attacker: Side
  objective: Objective
}

// ── the feature vectors ───────────────────────────────────

/**
 * Everything one unit's tree may branch on. `board` is the live board as the
 * round opens; only living units are considered.
 */
export function unitFeatures(
  unit: UnitState,
  board: UnitState[],
  ctx: FeatureContext,
): Features {
  const foeSide: Side = unit.side === 'player' ? 'enemy' : 'player'
  const lock = meleeLock(unit, board)

  let nearest: UnitState | null = null
  let nearestRange = Infinity
  let adjacentEnemies = 0
  let adjacentFriends = 0
  let foesAlive = 0
  let friendsAlive = 0
  let roundsToContact = Infinity
  let shootTargets = 0
  let shootRange = 0
  let reachable: UnitState | null = null
  let reachableRange = Infinity

  for (const other of board) {
    if (!isAlive(other)) continue
    const range = hexDistance(unit.pos, other.pos)
    if (other.side === unit.side) {
      if (other.id === unit.id) continue
      friendsAlive += 1
      if (range === 1) adjacentFriends += 1
      continue
    }
    foesAlive += 1
    if (range === 1) adjacentEnemies += 1
    if (range < nearestRange) {
      nearest = other
      nearestRange = range
    }
    roundsToContact = Math.min(roundsToContact, range - movementOf(other))
    if (canShoot(unit)) {
      if (canShootAt(unit, other.pos)) {
        shootTargets += 1
        if (shootRange === 0 || range < shootRange) shootRange = range
      }
      if (range <= profileOf(unit).range && range < reachableRange) {
        reachable = other
        reachableRange = range
      }
    }
  }

  // counting this unit itself keeps `friendsAlive` a headcount of the side
  friendsAlive += 1

  return {
    posture: ctx.posture,
    round: ctx.round,
    attacking: unit.side === ctx.attacker ? 1 : 0,
    deathmatch: ctx.objective === 'deathmatch' ? 1 : 0,
    ownDamage: unit.hits / HITS_TO_ELIMINATE,
    allowance: movementOf(unit),
    canShoot: canShoot(unit) ? 1 : 0,
    engaged: lock.engaged ? 1 : 0,
    heldFrontally: lock.engaged && lock.frontally ? 1 : 0,
    heldOnRearOnly: lock.engaged && !lock.frontally ? 1 : 0,
    adjacentEnemies,
    adjacentFriends,
    hexesAhead: hexesAhead(unit, board),
    foeRange: nearest ? nearestRange : FAR,
    foeWheels: nearest ? wheelsToward(unit, nearest.pos) : 0,
    foeWheelsAbs: nearest ? Math.abs(wheelsToward(unit, nearest.pos)) : 0,
    foeDamage: nearest ? nearest.hits / HITS_TO_ELIMINATE : 0,
    foeArmoured: nearest && profileOf(nearest).armoured ? 1 : 0,
    foeMelee: nearest ? profileOf(nearest).meleeModifier : 0,
    foeFacesMe: nearest && !inRearArc(nearest, unit.pos) ? 1 : 0,
    foeRearOpen: nearest && inRearArc(nearest, unit.pos) ? 1 : 0,
    foeCanShoot: nearest && canShoot(nearest) ? 1 : 0,
    roundsToContact: Number.isFinite(roundsToContact) ? roundsToContact : FAR,
    shootTargets,
    shootRange,
    shootWheels: reachable ? wheelsToward(unit, reachable.pos) : 0,
    friendsAlive,
    foesAlive,
    strengthRatio: strengthRatioOf(board, unit.side, foeSide, ctx.roster),
  }
}

function strengthRatioOf(
  board: UnitState[],
  side: Side,
  foeSide: Side,
  roster: Record<Side, number>,
): number {
  const own = strengthOf(board, side, roster[side])
  const foe = strengthOf(board, foeSide, roster[foeSide])
  const total = own + foe
  return total > 0 ? own / total : 0.5
}

/** Everything the army tree may branch on, for one side's view of the board. */
export function armyFeatures(
  board: UnitState[],
  side: Side,
  ctx: Omit<FeatureContext, 'posture'>,
): Features {
  const foeSide: Side = side === 'player' ? 'enemy' : 'player'
  const own = board.filter((unit) => unit.side === side && isAlive(unit))
  const foes = board.filter((unit) => unit.side === foeSide && isAlive(unit))

  let contacts = 0
  let closest = Infinity
  let rangeSum = 0
  for (const unit of own) {
    let nearest = Infinity
    for (const foe of foes) {
      const range = hexDistance(unit.pos, foe.pos)
      nearest = Math.min(nearest, range)
    }
    if (nearest === 1) contacts += 1
    if (Number.isFinite(nearest)) {
      closest = Math.min(closest, nearest)
      rangeSum += nearest
    }
  }

  return {
    round: ctx.round,
    attacking: side === ctx.attacker ? 1 : 0,
    deathmatch: ctx.objective === 'deathmatch' ? 1 : 0,
    friendsAlive: own.length,
    foesAlive: foes.length,
    ownStrength: strengthOf(board, side, ctx.roster[side]),
    foeStrength: strengthOf(board, foeSide, ctx.roster[foeSide]),
    strengthRatio: strengthRatioOf(board, side, foeSide, ctx.roster),
    contacts,
    closestRange: Number.isFinite(closest) ? closest : FAR,
    meanRange: own.length > 0 && foes.length > 0 ? rangeSum / own.length : FAR,
    ownShooters: own.filter(canShoot).length,
    foeShooters: foes.filter(canShoot).length,
    ownFast: own.filter((unit) => movementOf(unit) >= 3).length,
  }
}
