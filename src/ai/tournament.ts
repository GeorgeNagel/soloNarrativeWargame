/**
 * A round of the genetic algorithm's evaluation: every genome plays every other
 * genome, and itself, several games per pairing.
 *
 * Each pairing's games are played twice — once with each genome on the player
 * side — over the same scenario and the same dice seed, so neither is rewarded
 * for the side it drew. Self-play games are played and recorded too; they average
 * to exactly half a point for every genome, so they dilute the spread uniformly
 * without disturbing the ranking, and their differential is a useful read on how
 * much advantage the player side carries.
 */
import type { Side } from '../prototypes/tactical/model'
import { DEFAULT_ROUND_CAP, playGame, scoreFor } from './game'
import type { GameOutcome } from './game'
import { commanderOf } from './genome'
import type { Genome } from './genome'
import { makeRng, seedFrom } from './rng'
import { randomScenario } from './scenario'
import type { Commander } from './commander'

export interface Standing {
  genome: Genome
  /** Mean score per game, including self-play. */
  score: number
  games: number
  wins: number
  draws: number
  losses: number
  /** Mean surviving-strength differential, from this genome's point of view. */
  differential: number
  /** Mean rounds its games lasted. */
  rounds: number
  /** Games it played against a copy of itself. */
  selfGames: number
  /** Mean player-side advantage in those games — a read on scenario symmetry. */
  selfSideBias: number
}

export interface TournamentOptions {
  /** Scenarios per pairing. Each is played twice, once from each side. */
  gamesPerPairing?: number
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
  selfGames: number
  selfBias: number
}

function emptyTally(): Tally {
  return {
    score: 0,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    differential: 0,
    rounds: 0,
    selfGames: 0,
    selfBias: 0,
  }
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
 * Play the whole round robin and rank the population: highest mean score first,
 * ties broken by mean differential and then by id, so a ranking is stable.
 */
export function runTournament(
  population: Genome[],
  options: TournamentOptions = {},
): Standing[] {
  const games = options.gamesPerPairing ?? 3
  const seed = options.seed ?? 1
  const roundCap = options.roundCap ?? DEFAULT_ROUND_CAP

  const commanders = population.map(commanderOf)
  const tallies = population.map(() => emptyTally())

  for (let i = 0; i < population.length; i += 1) {
    for (let j = i; j < population.length; j += 1) {
      for (let game = 0; game < games; game += 1) {
        const scenarioSeed = seedFrom(seed, i, j, game)
        const scenario = randomScenario(makeRng(scenarioSeed), { seed: scenarioSeed })

        // the same scenario from both sides, each with its own dice stream
        const orientations: [number, number][] = [
          [i, j],
          [j, i],
        ]
        for (const [playerIndex, enemyIndex] of orientations) {
          const dice = makeRng(seedFrom(scenarioSeed, playerIndex, enemyIndex))
          const outcome = playGame(
            commanders[playerIndex],
            commanders[enemyIndex],
            scenario,
            dice,
            { roundCap },
          )
          credit(tallies[playerIndex], outcome, 'player')
          credit(tallies[enemyIndex], outcome, 'enemy')
          if (i === j) {
            tallies[i].selfGames += 1
            tallies[i].selfBias += outcome.differential
          }
        }
      }
    }
  }

  const standings: Standing[] = population.map((genome, index) => {
    const tally = tallies[index]
    const per = (value: number) => (tally.games > 0 ? value / tally.games : 0)
    return {
      genome,
      score: per(tally.score),
      games: tally.games,
      wins: tally.wins,
      draws: tally.draws,
      losses: tally.losses,
      differential: per(tally.differential),
      rounds: per(tally.rounds),
      selfGames: tally.selfGames,
      selfSideBias: tally.selfGames > 0 ? tally.selfBias / tally.selfGames : 0,
    }
  })

  return standings.sort(
    (a, b) =>
      b.score - a.score ||
      b.differential - a.differential ||
      a.genome.id.localeCompare(b.genome.id),
  )
}

export interface Benchmark {
  opponent: string
  games: number
  wins: number
  draws: number
  losses: number
  /** Wins plus half the draws, over games — the usual win rate. */
  winRate: number
  differential: number
}

/**
 * An absolute yardstick: a genome against a fixed commander, each scenario
 * played from both sides so the measurement carries no side bias.
 */
export function benchmark(
  genome: Genome,
  opponent: Commander,
  options: { games?: number; seed?: number; roundCap?: number } = {},
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

  return {
    opponent: opponent.id,
    games: tally.games,
    wins: tally.wins,
    draws: tally.draws,
    losses: tally.losses,
    winRate: tally.games > 0 ? (tally.wins + tally.draws / 2) / tally.games : 0,
    differential: tally.games > 0 ? tally.differential / tally.games : 0,
  }
}
