/**
 * A genome: one decision tree per unit type, plus an army tree that sets the
 * round's posture.
 *
 * The posture has no hardwired meaning. The army tree picks one of
 * `POSTURE_COUNT` values from the army-level features, and every unit tree gets
 * it as the `posture` feature — a channel the two levels of the genome can learn
 * to agree on, so an army can coordinate a general advance or a refused flank
 * without any of that being written in by hand.
 */
import {
  MAX_TURNS_PER_PHASE,
  UNIT_PROFILES,
  UNIT_TYPES,
  clampTurns,
  isAlive,
  movementOf,
  roundOrder,
} from '../prototypes/tactical/model'
import type {
  OrderBook,
  RoundOrder,
  Side,
  UnitState,
  UnitType,
} from '../prototypes/tactical/model'
import {
  ARMY_FEATURE_SPECS,
  POSTURE_COUNT,
  UNIT_FEATURE_SPECS,
  armyFeatures,
  unitFeatures,
} from './features'
import { deadNodesOf, evaluate, randomTree, sizeOf } from './tree'
import type { Tree, TreeSpec } from './tree'
import type { Commander } from './commander'
import type { Roster } from './roster'
import type { Rng } from './rng'

/**
 * Longest root-to-leaf path in a tree — deep enough for real tactics, shallow
 * enough that a randomly grown tree is not pure noise.
 */
export const DEFAULT_MAX_DEPTH = 6

/** Chance a node is a leaf at the root; it rises with depth as a tree grows. */
export const DEFAULT_LEAF_CHANCE = 0.25

/** The most hexes any type may advance, so a leaf's order stays in range. */
const MAX_ADVANCE = Math.max(
  ...UNIT_TYPES.map((type) => UNIT_PROFILES[type].movement),
)

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── the two tree specs ────────────────────────────────────

/** A random order: turns either way, and an advance up to the fastest type's. */
function randomOrder(rng: Rng): RoundOrder {
  return roundOrder(
    rng.range(-MAX_TURNS_PER_PHASE, MAX_TURNS_PER_PHASE),
    rng.range(0, MAX_ADVANCE),
    rng.range(-MAX_TURNS_PER_PHASE, MAX_TURNS_PER_PHASE),
  )
}

/** One field of an order, one step either way. */
function nudgeOrder(order: RoundOrder, rng: Rng): RoundOrder {
  const step = rng.chance(0.5) ? -1 : 1
  const field = rng.int(3)
  if (field === 0) {
    return roundOrder(clampTurns(order.before + step), order.advance, order.after)
  }
  if (field === 1) {
    return roundOrder(
      order.before,
      clamp(order.advance + step, 0, MAX_ADVANCE),
      order.after,
    )
  }
  return roundOrder(order.before, order.advance, clampTurns(order.after + step))
}

/** The two tree shapes a genome is built from. */
export interface GenomeSpecs {
  unit: TreeSpec<RoundOrder>
  army: TreeSpec<number>
}

export function makeGenomeSpecs(
  maxDepth = DEFAULT_MAX_DEPTH,
  leafChance = DEFAULT_LEAF_CHANCE,
): GenomeSpecs {
  return {
    unit: {
      features: UNIT_FEATURE_SPECS,
      randomLeaf: randomOrder,
      nudgeLeaf: nudgeOrder,
      maxDepth,
      leafChance,
    },
    army: {
      features: ARMY_FEATURE_SPECS,
      randomLeaf: (rng) => rng.int(POSTURE_COUNT),
      nudgeLeaf: (value, rng) =>
        (value + (rng.chance(0.5) ? 1 : POSTURE_COUNT - 1)) % POSTURE_COUNT,
      maxDepth,
      leafChance,
    },
  }
}

export const DEFAULT_SPECS = makeGenomeSpecs()

// ── the genome ────────────────────────────────────────────

export interface Genome {
  id: string
  /** The generation this genome was created in. */
  generation: number
  /** Chooses the round's posture from the army-level features. */
  army: Tree<number>
  /** One tree per unit type, evaluated once per living unit of that type. */
  units: Record<UnitType, Tree<RoundOrder>>
}

export function randomGenome(
  id: string,
  rng: Rng,
  generation = 0,
  specs: GenomeSpecs = DEFAULT_SPECS,
): Genome {
  const units = {} as Record<UnitType, Tree<RoundOrder>>
  for (const type of UNIT_TYPES) units[type] = randomTree(specs.unit, rng)
  return { id, generation, army: randomTree(specs.army, rng), units }
}

/** Cut an order down to what this unit may legally be given. */
export function legalOrder(order: RoundOrder, unit: UnitState): RoundOrder {
  return roundOrder(
    clampTurns(Math.round(order.before)),
    clamp(Math.round(order.advance), 0, movementOf(unit)),
    clampTurns(Math.round(order.after)),
  )
}

/**
 * The orders this genome gives its side for one round: the army tree runs once
 * to set the posture, then each living unit's type tree reads its own features —
 * including that posture — and names the order.
 */
export function ordersFor(
  genome: Genome,
  board: UnitState[],
  side: Side,
  round: number,
  roster: Roster,
  attacker: Side,
): OrderBook {
  const posture = postureFor(genome, board, side, round, roster, attacker)
  const orders: OrderBook = {}
  for (const unit of board) {
    if (unit.side !== side || !isAlive(unit)) continue
    const features = unitFeatures(unit, board, { round, posture, roster, attacker })
    orders[unit.id] = legalOrder(evaluate(genome.units[unit.type], features), unit)
  }
  return orders
}

/** The posture this genome would pick, exposed for reports and tests. */
export function postureFor(
  genome: Genome,
  board: UnitState[],
  side: Side,
  round: number,
  roster: Roster,
  attacker: Side,
): number {
  return evaluate(genome.army, armyFeatures(board, side, { round, roster, attacker }))
}

/** A genome as something a game can hand a side to. */
export function commanderOf(genome: Genome): Commander {
  return {
    id: genome.id,
    orders: (board, side, round, roster, attacker) =>
      ordersFor(genome, board, side, round, roster, attacker),
  }
}

/** Total nodes across a genome's five trees, for the size report. */
export function genomeSize(genome: Genome): number {
  return UNIT_TYPES.reduce(
    (total, type) => total + sizeOf(genome.units[type]),
    sizeOf(genome.army),
  )
}

/**
 * Nodes across the genome that no feature vector can reach. Crossover grafts
 * tests that a branch above has already decided, and the subtree behind one of
 * those is dead weight — counted here so a report can say so.
 */
export function genomeDeadNodes(genome: Genome): number {
  return UNIT_TYPES.reduce(
    (total, type) => total + deadNodesOf(genome.units[type]),
    deadNodesOf(genome.army),
  )
}
