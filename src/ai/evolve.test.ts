import { describe, expect, it } from 'vitest'
import { UNIT_TYPES } from '../prototypes/tactical/model'
import { closeOnNearest, holdFast } from './baseline'
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
import { benchmark, runGauntlet } from './tournament'
import { depthOf } from './tree'
import type { Tree } from './tree'

const SPECS = makeGenomeSpecs(4)

function population(size: number, seed = 1): Genome[] {
  return initialPopulation(size, makeRng(seed), SPECS)
}

const SMALL: ResolvedOptions = resolveOptions({
  populationSize: 6,
  generations: 1,
  games: 1,
  maxDepth: 4,
  roundCap: 8,
  playoffGames: 1,
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

describe('runGauntlet', () => {
  const opponents = [closeOnNearest, holdFast]
  const standings = runGauntlet(population(5), opponents, {
    games: 2,
    seed: 3,
    roundCap: 8,
  })

  it('ranks by score, highest first', () => {
    for (let i = 1; i < standings.length; i += 1) {
      expect(standings[i - 1].score).toBeGreaterThanOrEqual(standings[i].score)
    }
  })

  it('plays every opponent from both sides of every board', () => {
    for (const standing of standings) {
      expect(standing.games).toBe(2 * 2 * opponents.length)
      expect(standing.wins + standing.draws + standing.losses).toBe(standing.games)
      expect(standing.against.map((mark) => mark.opponent)).toEqual(
        opponents.map((opponent) => opponent.id),
      )
    }
  })

  it('weighs every opponent the same', () => {
    for (const standing of standings) {
      const mean =
        standing.against.reduce((total, mark) => total + mark.score, 0) /
        standing.against.length
      expect(standing.score).toBeCloseTo(mean, 10)
    }
  })

  it('plays every opponent on the same boards', () => {
    // two opponents that play identically can only get identical results if
    // they met the genome on the same boards with the same dice
    const twin = { ...holdFast, id: 'twin' }
    const [standing] = runGauntlet(population(1), [holdFast, twin], {
      games: 2,
      seed: 3,
      roundCap: 8,
    })
    const [a, b] = standing.against
    expect({ ...b, opponent: a.opponent }).toEqual(a)
  })

  it('replays identically from the same seed', () => {
    const again = runGauntlet(population(5), opponents, {
      games: 2,
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

  it('refuses to run with no opponents', () => {
    expect(() => runGauntlet(population(2), [])).toThrow(/at least one opponent/)
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
  const standings = runGauntlet(population(6), [holdFast], {
    games: 1,
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
    const tiny = runGauntlet(population(2), [holdFast], {
      games: 1,
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
    expect(JSON.stringify(b.reports)).not.toBe(JSON.stringify(a.reports))
  })

  it('reports the leader against every opponent', () => {
    const result = evolve({ ...SMALL, generations: 1 })
    for (const report of result.reports) {
      expect(report.against.map((mark) => mark.opponent)).toEqual(
        result.options.opponents.map((opponent) => opponent.id),
      )
      for (const mark of report.against) {
        expect(mark.winRate).toBeGreaterThanOrEqual(0)
        expect(mark.winRate).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps every generation leader once, and crowns the playoff winner', () => {
    const result = evolve({ ...SMALL, generations: 3 })
    const leaders = [...new Set(result.reports.map((report) => report.bestId))]
    expect(result.playoff.map((standing) => standing.genome.id).sort()).toEqual(
      leaders.sort(),
    )
    expect(result.champion).toBe(result.playoff[0].genome)
    for (const standing of result.playoff) {
      expect(standing.games).toBe(SMALL.playoffGames * 2 * SMALL.opponents.length)
    }
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
