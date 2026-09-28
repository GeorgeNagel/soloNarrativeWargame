/**
 * A round of the genetic algorithm's evaluation: every genome plays every fixed
 * opponent over the same set of scenarios.
 *
 * Each scenario is played twice — once with the genome on the player side, once
 * on the enemy side — over the same board, so neither side is rewarded for the
 * side it drew. Every opponent is played on the same boards, so a genome's
 * results against two opponents differ only by who it was playing.
 *
 * The opponents never change during a run, so a score is an absolute measure:
 * a genome ranked first has beaten the fixed set better than the rest of its
 * generation, not merely beaten the rest of its generation.
 */
import type { Side } from '../prototypes/tactical/model'
import { DEFAULT_ROUND_CAP, playGame, scoreFor } from './game'
import type { GameOutcome } from './game'
import { commanderOf } from './genome'
import type { Genome } from './genome'
import { makeRng, seedFrom } from './rng'
import { randomScenario } from './scenario'
import type { Commander } from './commander'

export interface Benchmark {
  opponent: string
  games: number
  wins: number
  draws: number
  losses: number
  /** Wins plus half the draws, over games — the usual win rate. */
  winRate: number
  /** Mean score per game, as `scoreFor` counts it. */
  score: number
  differential: number
  /** Mean rounds its games lasted. */
  rounds: number
}

export interface Standing {
  genome: Genome
  /** Mean score per game, over every opponent. */
  score: number
  games: number
  wins: number
  draws: number
  losses: number
  /** Mean surviving-strength differential, from this genome's point of view. */
  differential: number
  /** Mean rounds its games lasted. */
  rounds: number
  /** The same games, one row per opponent, in the order they were given. */
  against: Benchmark[]
}

export interface GauntletOptions {
  /** Scenarios, shared by every opponent. Each is played from both sides. */
  games?: number
  seed?: number
  roundCap?: number
}

interface Tally {
  score: number
  games: number
  wins: number
  draws: number
  losses: number
  differential: number
  rounds: number
}

function emptyTally(): Tally {
  return { score: 0, games: 0, wins: 0, draws: 0, losses: 0, differential: 0, rounds: 0 }
}

function credit(tally: Tally, outcome: GameOutcome, side: Side): void {
  tally.score += scoreFor(outcome, side)
  tally.games += 1
  tally.rounds += outcome.rounds
  tally.differential +=
    side === 'player' ? outcome.differential : -outcome.differential
  if (outcome.winner === null) tally.draws += 1
  else if (outcome.winner === side) tally.wins += 1
  else tally.losses += 1
}

/**
 * A genome against one fixed commander, each scenario played from both sides so
 * the measurement carries no side bias. Scenarios depend on the seed and the
 * game index alone, never on the opponent, which is what lets every opponent
 * share the same boards.
 */
export function benchmark(
  genome: Genome,
  opponent: Commander,
  options: GauntletOptions = {},
): Benchmark {
  const games = options.games ?? 20
  const seed = options.seed ?? 7
  const roundCap = options.roundCap ?? DEFAULT_ROUND_CAP
  const subject = commanderOf(genome)
  const tally = emptyTally()

  for (let game = 0; game < games; game += 1) {
    const scenarioSeed = seedFrom(seed, game)
    const scenario = randomScenario(makeRng(scenarioSeed), { seed: scenarioSeed })
    for (const asPlayer of [true, false]) {
      const dice = makeRng(seedFrom(scenarioSeed, asPlayer ? 1 : 2))
      const outcome = asPlayer
        ? playGame(subject, opponent, scenario, dice, { roundCap })
        : playGame(opponent, subject, scenario, dice, { roundCap })
      credit(tally, outcome, asPlayer ? 'player' : 'enemy')
    }
  }

  const per = (value: number) => (tally.games > 0 ? value / tally.games : 0)
  return {
    opponent: opponent.id,
    games: tally.games,
    wins: tally.wins,
    draws: tally.draws,
    losses: tally.losses,
    winRate: per(tally.wins + tally.draws / 2),
    score: per(tally.score),
    differential: per(tally.differential),
    rounds: per(tally.rounds),
  }
}

/** One genome's results against every opponent, folded into a standing. */
function standingOf(genome: Genome, against: Benchmark[]): Standing {
  const games = against.reduce((total, mark) => total + mark.games, 0)
  // every opponent gets the same number of games, so a mean over games is also
  // a mean over opponents: each one weighs the same
  const sum = (field: 'score' | 'differential' | 'rounds') =>
    games > 0
      ? against.reduce((total, mark) => total + mark[field] * mark.games, 0) / games
      : 0
  return {
    genome,
    score: sum('score'),
    games,
    wins: against.reduce((total, mark) => total + mark.wins, 0),
    draws: against.reduce((total, mark) => total + mark.draws, 0),
    losses: against.reduce((total, mark) => total + mark.losses, 0),
    differential: sum('differential'),
    rounds: sum('rounds'),
    against,
  }
}

/**
 * Play every genome against every opponent and rank them: highest mean score
 * first, ties broken by mean differential and then by id, so a ranking is stable.
 */
export function runGauntlet(
  population: Genome[],
  opponents: readonly Commander[],
  options: GauntletOptions = {},
): Standing[] {
  if (opponents.length === 0) throw new Error('a gauntlet needs at least one opponent')
  const standings = population.map((genome) =>
    standingOf(
      genome,
      opponents.map((opponent) => benchmark(genome, opponent, options)),
    ),
  )
  return standings.sort(
    (a, b) =>
      b.score - a.score ||
      b.differential - a.differential ||
      a.genome.id.localeCompare(b.genome.id),
  )
}
