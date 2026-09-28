/**
 * A headless game between two genomes.
 *
 * Both commanders write their whole order book, the books are merged, and
 * `resolveRound` runs exactly as it does under the console — same rules, same
 * dice, only the dice come from a seeded stream so a game replays.
 */
import { isAlive, type OrderBook, type Side, type UnitState } from '../prototypes/tactical/model'
import { resolveRound, survivors } from '../prototypes/tactical/sim'
import type { RoundResult } from '../prototypes/tactical/sim'
import { strengthOf } from './features'
import { rosterOf } from './roster'
import type { Roster } from './roster'
import type { Commander } from './commander'
import { deploy } from './scenario'
import type { Objective, Scenario } from './scenario'
import { seededD6 } from './rng'
import type { Rng } from './rng'

/** Rounds a game runs before it is called off, and the defender wins. */
export const DEFAULT_ROUND_CAP = 30

/**
 * Consecutive rounds in which nothing moves, nothing shoots and nothing fights
 * before the game is called off. Two armies that both decide to stand fast would
 * otherwise burn the whole round cap doing nothing.
 */
const STALE_LIMIT = 3

/**
 * How much of the score the surviving-strength differential is worth. At 0.5 the
 * best possible loss only ties the worst possible win, so a win never ranks below
 * a loss.
 */
export const DIFFERENTIAL_WEIGHT = 0.5

export interface GameOutcome {
  /** Rounds actually resolved. */
  rounds: number
  /**
   * The side that met the scenario's objective. There are no draws: in `hold` the
   * attacker wins only by wiping the defender out, in `deathmatch` the side that
   * removed more enemy units wins, and every other ending goes to the defender.
   */
  winner: Side
  /** The scenario's attacker. */
  attacker: Side
  /** The scenario's objective. */
  objective: Objective
  /** Enemy units each side removed. */
  kills: Record<Side, number>
  /** Surviving strength each side kept, as a fraction of what it deployed. */
  strength: Record<Side, number>
  /** `strength.player - strength.enemy`, in [-1, 1]. */
  differential: number
  /** Set when the round cap or a stalemate stopped the game. */
  timedOut: boolean
  /** Units each side deployed. */
  roster: Roster
}

/** One resolved round, for a caller watching a game go by. */
export interface RoundTrace {
  round: number
  /** The board as the round opened. */
  before: UnitState[]
  /** Both sides' orders, merged the way the round took them. */
  orders: OrderBook
  result: RoundResult
}

export interface GameOptions {
  roundCap?: number
  /** Called for each resolved round, in order. */
  onRound?: (trace: RoundTrace) => void
}

function positionsOf(units: UnitState[]): string {
  return units.map((unit) => `${unit.id}:${unit.pos.q},${unit.pos.r}`).join('|')
}

function livingCount(units: UnitState[], side: Side): number {
  return units.filter((unit) => unit.side === side && isAlive(unit)).length
}

/**
 * Play one game to a conclusion. `player` commands the player side and `enemy`
 * the enemy side; `rng` supplies every die rolled, so the same scenario and the
 * same seed always produce the same game.
 */
export function playGame(
  player: Commander,
  enemy: Commander,
  scenario: Scenario,
  rng: Rng,
  options: GameOptions = {},
): GameOutcome {
  const cap = options.roundCap ?? DEFAULT_ROUND_CAP
  const roll = seededD6(rng)
  let board = deploy(scenario)
  const roster = rosterOf(board)

  let rounds = 0
  let stale = 0
  let timedOut = true

  for (let round = 1; round <= cap; round += 1) {
    if (livingCount(board, 'player') === 0 || livingCount(board, 'enemy') === 0) {
      timedOut = false
      break
    }

    const before = positionsOf(board)
    const { attacker, objective } = scenario
    const orders = {
      ...player.orders(board, 'player', round, roster, attacker, objective),
      ...enemy.orders(board, 'enemy', round, roster, attacker, objective),
    }
    const result = resolveRound(board, orders, roll)
    options.onRound?.({ round, before: board, orders, result })
    board = survivors(result)
    rounds = round

    const idle =
      result.shots.length === 0 &&
      result.engagements.length === 0 &&
      positionsOf(board) === before
    stale = idle ? stale + 1 : 0
    if (stale >= STALE_LIMIT) break

    if (livingCount(board, 'player') === 0 || livingCount(board, 'enemy') === 0) {
      timedOut = false
      break
    }
  }

  const strength = {
    player: strengthOf(board, 'player', roster.player),
    enemy: strengthOf(board, 'enemy', roster.enemy),
  }
  const kills = {
    player: roster.enemy - livingCount(board, 'enemy'),
    enemy: roster.player - livingCount(board, 'player'),
  }
  const { attacker, objective } = scenario
  const defender: Side = attacker === 'player' ? 'enemy' : 'player'
  const attackerWon =
    objective === 'hold'
      ? livingCount(board, attacker) > 0 && livingCount(board, defender) === 0
      : kills[attacker] > kills[defender]

  return {
    rounds,
    winner: attackerWon ? attacker : defender,
    attacker,
    objective,
    kills,
    strength,
    differential: strength.player - strength.enemy,
    timedOut,
    roster,
  }
}

/**
 * One side's score for a game: a win or loss, plus a slice of the
 * surviving-strength differential.
 *
 * The differential is what gives selection a gradient in the first generations,
 * when almost every game is called off and pure win rate would rank a population
 * by who happened to defend. It separates two genomes that both held, or both
 * failed to break through, by how much each kept.
 */
export function scoreFor(outcome: GameOutcome, side: Side): number {
  const result = outcome.winner === side ? 1 : 0
  const differential =
    side === 'player' ? outcome.differential : -outcome.differential
  return result + DIFFERENTIAL_WEIGHT * differential
}
