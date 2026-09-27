import { describe, expect, it } from 'vitest'
import { UNIT_TYPES } from '../prototypes/tactical/model'
import { holdFast } from './baseline'
import {
  breed,
  evolve,
  initialPopulation,
  nextGeneration,
  resolveOptions,
} from './evolve'
import type { ResolvedOptions } from './evolve'
import { makeGenomeSpecs, randomGenome } from './genome'
import type { Genome } from './genome'
import { makeRng } from './rng'
import { benchmark, runTournament } from './tournament'
import { depthOf } from './tree'
import type { Tree } from './tree'

const SPECS = makeGenomeSpecs(4)

function population(size: number, seed = 1): Genome[] {
  return initialPopulation(size, makeRng(seed), SPECS)
}

const SMALL: ResolvedOptions = resolveOptions({
  populationSize: 6,
  generations: 1,
  gamesPerPairing: 1,
  maxDepth: 4,
  roundCap: 8,
  benchmarkGames: 0,
})

/** All five of a genome's trees, for the shape assertions. */
function treesOf(genome: Genome): Tree<unknown>[] {
  return [genome.army, ...UNIT_TYPES.map((type) => genome.units[type])]
}

describe('initialPopulation', () => {
  it('builds the asked-for number of genomes, each with all five trees', () => {
    const genomes = population(5)
    expect(genomes.length).toBe(5)
    expect(new Set(genomes.map((genome) => genome.id)).size).toBe(5)
    for (const genome of genomes) {
      expect(genome.generation).toBe(0)
      for (const tree of treesOf(genome)) {
        expect(depthOf(tree)).toBeLessThanOrEqual(SPECS.unit.maxDepth)
      }
    }
  })
})

describe('runTournament', () => {
  const standings = runTournament(population(5), {
    gamesPerPairing: 1,
    seed: 3,
    roundCap: 8,
  })

  it('ranks by score, highest first', () => {
    for (let i = 1; i < standings.length; i += 1) {
      expect(standings[i - 1].score).toBeGreaterThanOrEqual(standings[i].score)
    }
  })

  it('gives every genome the same number of games', () => {
    const games = new Set(standings.map((standing) => standing.games))
    expect(games.size).toBe(1)
  })

  it('splits the points, so the mean score is pinned at a half', () => {
    // every game hands out exactly one point between its two sides, so this is
    // an invariant of the round robin, not a property of the population
    const mean =
      standings.reduce((total, standing) => total + standing.score, 0) /
      standings.length
    expect(mean).toBeCloseTo(0.5, 10)
  })

  it('counts each genome a win, draw or loss for every game it played', () => {
    for (const standing of standings) {
      expect(standing.wins + standing.draws + standing.losses).toBe(standing.games)
      expect(standing.selfGames).toBeGreaterThan(0)
    }
  })

  it('replays identically from the same seed', () => {
    const again = runTournament(population(5), {
      gamesPerPairing: 1,
      seed: 3,
      roundCap: 8,
    })
    expect(again.map((standing) => standing.genome.id)).toEqual(
      standings.map((standing) => standing.genome.id),
    )
    expect(again.map((standing) => standing.score)).toEqual(
      standings.map((standing) => standing.score),
    )
  })

  it('finds little side bias in the mirrored scenarios', () => {
    const bias =
      standings.reduce((total, standing) => total + standing.selfSideBias, 0) /
      standings.length
    expect(Math.abs(bias)).toBeLessThan(0.2)
  })
})

describe('breed', () => {
  it('keeps every tree inside the depth limit', () => {
    const rng = makeRng(5)
    for (let i = 0; i < 40; i += 1) {
      const a = randomGenome('a', rng, 0, SPECS)
      const b = randomGenome('b', rng, 0, SPECS)
      const child = breed(a, b, 'c', 3, rng, SPECS, 0.3)
      expect(child.id).toBe('c')
      expect(child.generation).toBe(3)
      for (const tree of treesOf(child)) {
        expect(depthOf(tree)).toBeLessThanOrEqual(4)
      }
    }
  })

  it('leaves both parents as they were', () => {
    const rng = makeRng(6)
    const a = randomGenome('a', rng, 0, SPECS)
    const b = randomGenome('b', rng, 0, SPECS)
    const before = JSON.stringify([a, b])
    breed(a, b, 'c', 1, rng, SPECS, 0.5)
    expect(JSON.stringify([a, b])).toBe(before)
  })
})

describe('nextGeneration', () => {
  const standings = runTournament(population(6), {
    gamesPerPairing: 1,
    seed: 4,
    roundCap: 8,
  })

  it('refills the population and carries the elites over untouched', () => {
    const next = nextGeneration(standings, 1, makeRng(7), SMALL, SPECS)
    expect(next.length).toBe(SMALL.populationSize)
    for (let i = 0; i < SMALL.elites; i += 1) {
      expect(next[i]).toBe(standings[i].genome)
    }
    for (const genome of next.slice(SMALL.elites)) {
      expect(genome.generation).toBe(1)
      for (const tree of treesOf(genome)) {
        expect(depthOf(tree)).toBeLessThanOrEqual(4)
      }
    }
  })

  it('breeds only from the top half of the ranking', () => {
    const options = { ...SMALL, elites: SMALL.populationSize }
    const next = nextGeneration(standings, 1, makeRng(8), options, SPECS)
    const keep = Math.round(standings.length * options.survivorFraction)
    // the elites are taken from the survivors, so an elite count past the
    // survivor count cannot reach further down the ranking
    expect(next.length).toBe(options.populationSize)
    const carried = next.filter((genome) => genome.generation === 0)
    expect(carried.length).toBeLessThanOrEqual(keep)
    for (const genome of carried) {
      const rank = standings.findIndex((standing) => standing.genome === genome)
      expect(rank).toBeLessThan(keep)
    }
  })

  it('always keeps at least two parents, however small the population', () => {
    const tiny = runTournament(population(2), {
      gamesPerPairing: 1,
      seed: 5,
      roundCap: 6,
    })
    const next = nextGeneration(tiny, 1, makeRng(9), { ...SMALL, populationSize: 2 }, SPECS)
    expect(next.length).toBe(2)
  })
})

describe('evolve', () => {
  it('reports one line per generation plus the starting one', () => {
    const result = evolve({ ...SMALL, generations: 2 })
    expect(result.reports.map((report) => report.generation)).toEqual([0, 1, 2])
    expect(result.standings.length).toBe(SMALL.populationSize)
    expect(result.champion).toBe(result.standings[0].genome)
  })

  it('replays identically from the same seed', () => {
    const once = evolve({ ...SMALL, generations: 2, seed: 11 })
    const twice = evolve({ ...SMALL, generations: 2, seed: 11 })
    expect(JSON.stringify(twice.champion)).toBe(JSON.stringify(once.champion))
    expect(twice.reports).toEqual(once.reports)
  })

  it('takes a different course from a different seed', () => {
    const a = evolve({ ...SMALL, generations: 2, seed: 11 })
    const b = evolve({ ...SMALL, generations: 2, seed: 12 })
    expect(JSON.stringify(b.champion)).not.toBe(JSON.stringify(a.champion))
  })

  it('benchmarks the leader when it is asked to', () => {
    const result = evolve({ ...SMALL, generations: 1, benchmarkGames: 2 })
    for (const report of result.reports) {
      expect(report.benchmarks.length).toBe(result.options.baselines.length)
      for (const mark of report.benchmarks) {
        expect(mark.winRate).toBeGreaterThanOrEqual(0)
        expect(mark.winRate).toBeLessThanOrEqual(1)
      }
    }
  })

  it('leaves the benchmarks out when it is not', () => {
    const result = evolve({ ...SMALL, generations: 1, benchmarkGames: 0 })
    expect(result.reports[0].benchmarks).toEqual([])
  })
})

describe('benchmark', () => {
  it('plays each scenario from both sides and counts every game', () => {
    const genome = randomGenome('g', makeRng(2), 0, SPECS)
    const mark = benchmark(genome, holdFast, { games: 3, seed: 4, roundCap: 8 })
    expect(mark.opponent).toBe('hold-fast')
    expect(mark.games).toBe(6)
    expect(mark.wins + mark.draws + mark.losses).toBe(6)
    expect(mark.winRate).toBeCloseTo((mark.wins + mark.draws / 2) / 6, 10)
  })
})
