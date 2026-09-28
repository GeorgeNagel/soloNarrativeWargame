import { describe, expect, it } from 'vitest'
import { UNIT_TYPES } from '../prototypes/tactical/model'
import { BASELINES, holdFast } from './baseline'
import {
  CHECKPOINT_VERSION,
  checkpointName,
  curveCsv,
  deserializeOptions,
  fromCheckpoint,
  parseCheckpoint,
  parseGenome,
  runPaths,
  serializeOptions,
  toCheckpoint,
} from './checkpoint'
import { evolve, resolveOptions, startRun, stepRun } from './evolve'
import type { ResolvedOptions } from './evolve'
import { makeGenomeSpecs, randomGenome } from './genome'
import { genomeOpponent } from './opponents'
import { makeRng } from './rng'

const OPTIONS: ResolvedOptions = resolveOptions({
  populationSize: 6,
  generations: 4,
  games: 1,
  maxDepth: 4,
  roundCap: 8,
  playoffGames: 1,
  seed: 21,
})

const SPECS = makeGenomeSpecs(OPTIONS.maxDepth)

/** A checkpoint as it would be read back off disk, not the object in memory. */
function roundTrip(value: unknown) {
  return parseCheckpoint(JSON.parse(JSON.stringify(value)))
}

describe('serializeOptions', () => {
  it('names the baselines rather than holding them', () => {
    const saved = serializeOptions(OPTIONS)
    expect(saved.opponents).toEqual(
      BASELINES.map((opponent) => ({ id: opponent.id, genome: null })),
    )
    expect(saved.seed).toBe(21)
  })

  it('comes back as the same options', () => {
    const back = deserializeOptions(serializeOptions(OPTIONS))
    expect(serializeOptions(back)).toEqual(serializeOptions(OPTIONS))
    expect(back.opponents.map((opponent) => opponent.commander)).toEqual(
      OPTIONS.opponents.map((opponent) => opponent.commander),
    )
  })

  it('holds a saved opponent in full, so it plays the same after a resume', () => {
    const genome = randomGenome('g', makeRng(3), 0, SPECS)
    const options = { ...OPTIONS, opponents: [...OPTIONS.opponents, genomeOpponent('rival', genome)] }
    const saved = JSON.parse(JSON.stringify(serializeOptions(options)))
    const back = deserializeOptions(saved)
    const rival = back.opponents[back.opponents.length - 1]
    expect(rival.id).toBe('rival')
    expect(rival.commander.id).toBe('rival')
    expect(rival.genome).toEqual(genome)
  })

  it('lets the caller override what it is resumed with', () => {
    const back = deserializeOptions(serializeOptions(OPTIONS), { generations: 99 })
    expect(back.generations).toBe(99)
    expect(back.seed).toBe(OPTIONS.seed)
  })

  it('refuses a baseline this build does not have', () => {
    const saved = {
      ...serializeOptions(OPTIONS),
      opponents: [{ id: 'no-such-plan', genome: null }],
    }
    expect(() => deserializeOptions(saved)).toThrow(/unknown baseline/)
  })
})

describe('a checkpoint', () => {
  const state = startRun(OPTIONS, SPECS)
  const checkpoint = toCheckpoint('a-run', state, OPTIONS)

  it('carries the run, the ranking and the generator state', () => {
    expect(checkpoint.version).toBe(CHECKPOINT_VERSION)
    expect(checkpoint.runId).toBe('a-run')
    expect(checkpoint.generation).toBe(0)
    expect(checkpoint.rngState).toBe(state.rng.state())
    expect(checkpoint.population.length).toBe(OPTIONS.populationSize)
    expect(checkpoint.standings.length).toBe(OPTIONS.populationSize)
    expect(checkpoint.reports.length).toBe(1)
    expect(checkpoint.winners.map((genome) => genome.id)).toEqual([
      state.standings[0].genome.id,
    ])
  })

  it('stores the population in ranked order', () => {
    expect(checkpoint.population.map((genome) => genome.id)).toEqual(
      state.standings.map((standing) => standing.genome.id),
    )
    expect(checkpoint.standings.map((row) => row.id)).toEqual(
      checkpoint.population.map((genome) => genome.id),
    )
  })

  it('survives a trip through JSON', () => {
    expect(roundTrip(checkpoint)).toEqual(checkpoint)
  })

  it('comes back as a run that carries on where it left off', () => {
    const resumed = fromCheckpoint(roundTrip(checkpoint))
    expect(resumed.state.generation).toBe(state.generation)
    expect(resumed.state.rng.state()).toBe(state.rng.state())
    expect(resumed.state.standings.map((standing) => standing.genome.id)).toEqual(
      state.standings.map((standing) => standing.genome.id),
    )
    expect(resumed.state.standings[0].score).toBe(state.standings[0].score)
  })
})

describe('resuming', () => {
  it('produces exactly the run that never stopped', () => {
    const straight = evolve(OPTIONS)

    // stop after two generations, write it down, read it back, carry on
    let state = startRun(OPTIONS, SPECS)
    state = stepRun(state, OPTIONS, SPECS)
    state = stepRun(state, OPTIONS, SPECS)
    const resumed = fromCheckpoint(roundTrip(toCheckpoint('a-run', state, OPTIONS)))
    const carried = evolve(resumed.options, {}, resumed.state)

    expect(carried.reports).toEqual(straight.reports)
    expect(JSON.stringify(carried.champion)).toBe(JSON.stringify(straight.champion))
    expect(carried.standings.map((standing) => standing.score)).toEqual(
      straight.standings.map((standing) => standing.score),
    )
  })

  it('carries a resumed run further than the one that wrote the file', () => {
    const state = stepRun(startRun(OPTIONS, SPECS), OPTIONS, SPECS)
    const resumed = fromCheckpoint(roundTrip(toCheckpoint('a-run', state, OPTIONS)), {
      generations: 3,
    })
    const carried = evolve(resumed.options, {}, resumed.state)
    expect(carried.reports.map((report) => report.generation)).toEqual([0, 1, 2, 3])
  })
})

describe('parseGenome', () => {
  const genome = randomGenome('g', makeRng(4), 2, SPECS)

  it('reads back what a run wrote', () => {
    expect(parseGenome(JSON.parse(JSON.stringify(genome)))).toEqual(genome)
  })

  it('wants a tree for every unit type', () => {
    for (const type of UNIT_TYPES) {
      const missing = JSON.parse(JSON.stringify(genome))
      delete missing.units[type]
      expect(() => parseGenome(missing)).toThrow(new RegExp(`missing ${type}`))
    }
  })

  it('refuses a node that is neither a branch nor a leaf', () => {
    const broken = JSON.parse(JSON.stringify(genome))
    broken.units.infantry = { kind: 'guess' }
    expect(() => parseGenome(broken)).toThrow(/has no kind/)
  })

  it('refuses a threshold that is not a number', () => {
    const broken = {
      ...genome,
      army: { kind: 'branch', feature: 'round', threshold: 'soon', below: genome.army, atOrAbove: genome.army },
    }
    expect(() => parseGenome(broken)).toThrow(/threshold/)
  })

  it('refuses an order with a missing field', () => {
    const broken = JSON.parse(JSON.stringify(genome))
    broken.units.cavalry = { kind: 'leaf', value: { before: 0, advance: 1 } }
    expect(() => parseGenome(broken)).toThrow(/order.after/)
  })

  it('keeps a branch on a feature this build no longer has', () => {
    // `evaluate` reads a missing feature as zero on purpose, so an older
    // checkpoint still loads rather than being rejected
    const older = {
      ...genome,
      army: {
        kind: 'branch',
        feature: 'morale',
        threshold: 2.5,
        below: { kind: 'leaf', value: 0 },
        atOrAbove: { kind: 'leaf', value: 1 },
      },
    }
    const parsed = parseGenome(older)
    expect(parsed.army.kind).toBe('branch')
  })
})

describe('parseCheckpoint', () => {
  const checkpoint = toCheckpoint('a-run', startRun(OPTIONS, SPECS), OPTIONS)

  it('refuses a version it does not read', () => {
    expect(() => parseCheckpoint({ ...checkpoint, version: 99 })).toThrow(/version 99/)
  })

  it('says why a round-robin checkpoint cannot be resumed', () => {
    expect(() => parseCheckpoint({ ...checkpoint, version: 1 })).toThrow(/round-robin/)
  })

  it('refuses a ranking that does not line up with the population', () => {
    expect(() =>
      parseCheckpoint({ ...checkpoint, standings: checkpoint.standings.slice(1) }),
    ).toThrow(/different lengths/)
  })

  it('refuses an empty population', () => {
    expect(() =>
      parseCheckpoint({ ...checkpoint, population: [], standings: [] }),
    ).toThrow(/empty/)
  })

  it('refuses something that is not a checkpoint at all', () => {
    expect(() => parseCheckpoint(null)).toThrow(/not an object/)
    expect(() => parseCheckpoint({ version: CHECKPOINT_VERSION })).toThrow()
  })
})

describe('paths and the curve', () => {
  it('lays a run out under its own directory', () => {
    const paths = runPaths('artifacts', 'a-run')
    expect(paths.root).toBe('artifacts/runs/a-run')
    expect(paths.champion).toBe('artifacts/runs/a-run/champion.json')
    expect(paths.checkpoints).toBe('artifacts/runs/a-run/checkpoints')
  })

  it('names checkpoints so a listing sorts in order', () => {
    expect([checkpointName(10), checkpointName(2)].sort()).toEqual([
      'gen-0002.json',
      'gen-0010.json',
    ])
  })

  it('writes the curve as one row a generation, with a column per opponent', () => {
    const result = evolve({ ...OPTIONS, generations: 1 })
    const rows = curveCsv(result.reports).trimEnd().split('\n')
    expect(rows.length).toBe(3)
    expect(rows[0]).toContain('generation,best,mean,worst')
    expect(rows[0]).toContain(`${holdFast.id}.winRate`)
    expect(rows[1].split(',').length).toBe(rows[0].split(',').length)
  })
})
