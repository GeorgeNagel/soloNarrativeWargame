import { describe, expect, it } from 'vitest'
import {
  HITS_TO_ELIMINATE,
  MAX_TURNS_PER_PHASE,
  movementOf,
} from '../prototypes/tactical/model'
import type { UnitState } from '../prototypes/tactical/model'
import { closeOnNearest, holdFast } from './baseline'
import { DEFAULT_ROUND_CAP, playGame, scoreFor } from './game'
import type { GameOutcome } from './game'
import { commanderOf, ordersFor, randomGenome } from './genome'
import { makeRng, seedFrom } from './rng'
import { rosterOf } from './roster'
import { deploy, randomScenario } from './scenario'

function scenarioFor(seed: number) {
  return randomScenario(makeRng(seed), { seed })
}

describe('playGame', () => {
  it('always stops, inside the round cap', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const scenario = scenarioFor(seed)
      const a = commanderOf(randomGenome('a', makeRng(seed + 100)))
      const b = commanderOf(randomGenome('b', makeRng(seed + 200)))
      const outcome = playGame(a, b, scenario, makeRng(seed))
      expect(outcome.rounds).toBeGreaterThan(0)
      expect(outcome.rounds).toBeLessThanOrEqual(DEFAULT_ROUND_CAP)
    }
  })

  it('replays identically from the same scenario and seed', () => {
    const scenario = scenarioFor(4)
    const a = commanderOf(randomGenome('a', makeRng(1)))
    const b = commanderOf(randomGenome('b', makeRng(2)))
    const once = playGame(a, b, scenario, makeRng(9))
    const twice = playGame(a, b, scenario, makeRng(9))
    expect(once).toEqual(twice)
  })

  it('never leaves both sides standing when it names a winner', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const outcome = playGame(
        closeOnNearest,
        closeOnNearest,
        scenarioFor(seed),
        makeRng(seed),
      )
      if (outcome.winner !== null) {
        expect(outcome.strength[outcome.winner]).toBeGreaterThan(0)
        const loser = outcome.winner === 'player' ? 'enemy' : 'player'
        expect(outcome.strength[loser]).toBe(0)
      }
    }
  })

  it('keeps the strengths and the differential in range', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const outcome = playGame(
        closeOnNearest,
        holdFast,
        scenarioFor(seed),
        makeRng(seed),
      )
      for (const side of ['player', 'enemy'] as const) {
        expect(outcome.strength[side]).toBeGreaterThanOrEqual(0)
        expect(outcome.strength[side]).toBeLessThanOrEqual(1)
      }
      expect(outcome.differential).toBeCloseTo(
        outcome.strength.player - outcome.strength.enemy,
        10,
      )
    }
  })

  it('calls off two armies that both stand fast, well short of the cap', () => {
    const outcome = playGame(holdFast, holdFast, scenarioFor(6), makeRng(6))
    expect(outcome.timedOut).toBe(true)
    expect(outcome.rounds).toBeLessThan(DEFAULT_ROUND_CAP)
  })

  it('honours a shorter round cap', () => {
    const outcome = playGame(
      closeOnNearest,
      closeOnNearest,
      scenarioFor(8),
      makeRng(8),
      { roundCap: 2 },
    )
    expect(outcome.rounds).toBeLessThanOrEqual(2)
  })

  it('reports the roster each side deployed', () => {
    const scenario = scenarioFor(12)
    const outcome = playGame(holdFast, holdFast, scenario, makeRng(1))
    expect(outcome.roster).toEqual(rosterOf(scenario.units))
  })
})

describe('scoreFor', () => {
  function outcome(
    winner: GameOutcome['winner'],
    differential: number,
  ): GameOutcome {
    return {
      rounds: 5,
      winner,
      strength: { player: 0, enemy: 0 },
      differential,
      timedOut: false,
      roster: { player: 3, enemy: 3 },
    }
  }

  it('splits exactly one point between the two sides of a game', () => {
    for (const winner of ['player', 'enemy', null] as const) {
      for (const differential of [-1, -0.25, 0, 0.5, 1]) {
        const game = outcome(winner, differential)
        expect(scoreFor(game, 'player') + scoreFor(game, 'enemy')).toBeCloseTo(1, 10)
      }
    }
  })

  it('pays a win more than a draw and a draw more than a loss', () => {
    expect(scoreFor(outcome('player', 0), 'player')).toBeGreaterThan(
      scoreFor(outcome(null, 0), 'player'),
    )
    expect(scoreFor(outcome(null, 0), 'player')).toBeGreaterThan(
      scoreFor(outcome('enemy', 0), 'player'),
    )
  })

  it('separates two draws by the strength each side kept', () => {
    expect(scoreFor(outcome(null, 0.5), 'player')).toBeGreaterThan(
      scoreFor(outcome(null, -0.5), 'player'),
    )
  })
})

describe('the orders a commander writes', () => {
  const legal = (orders: Record<string, unknown>, board: UnitState[]) => {
    const byId = new Map(board.map((unit) => [unit.id, unit]))
    for (const [id, order] of Object.entries(orders)) {
      const unit = byId.get(id)
      expect(unit).toBeDefined()
      expect(unit!.hits).toBeLessThan(HITS_TO_ELIMINATE)
      const { before, advance, after } = order as {
        before: number
        advance: number
        after: number
      }
      for (const turns of [before, after]) {
        expect(Number.isInteger(turns)).toBe(true)
        expect(Math.abs(turns)).toBeLessThanOrEqual(MAX_TURNS_PER_PHASE)
      }
      expect(Number.isInteger(advance)).toBe(true)
      expect(advance).toBeGreaterThanOrEqual(0)
      expect(advance).toBeLessThanOrEqual(movementOf(unit!))
    }
  }

  it('is legal for every unit, for a random genome and for the baselines', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const board = deploy(scenarioFor(seed))
      const roster = rosterOf(board)
      const genome = randomGenome('g', makeRng(seedFrom(seed, 3)))
      for (const side of ['player', 'enemy'] as const) {
        const books = [
          ordersFor(genome, board, side, 1, roster),
          closeOnNearest.orders(board, side, 1, roster),
          holdFast.orders(board, side, 1, roster),
        ]
        for (const book of books) {
          legal(book as Record<string, unknown>, board)
          const ordered = Object.keys(book)
          expect(ordered.length).toBe(roster[side])
          for (const id of ordered) {
            expect(board.find((unit) => unit.id === id)!.side).toBe(side)
          }
        }
      }
    }
  })
})
