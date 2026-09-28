import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BASELINES } from './baseline'
import { makeGenomeSpecs, randomGenome } from './genome'
import { makeRng } from './rng'
import {
  allOpponents,
  loadSavedOpponents,
  nameProblem,
  opponentPath,
  opponentsDir,
  readSavedOpponent,
  saveOpponent,
} from './saved-opponents'

const genome = randomGenome('g3-2', makeRng(1), 3, makeGenomeSpecs(4))

function save(outDir: string, name: string) {
  return saveOpponent(outDir, {
    name,
    savedAt: '2026-09-28T00:00:00.000Z',
    source: { runId: 'a-run', genomeId: genome.id, generation: genome.generation },
    playoff: [],
    genome,
  })
}

describe('saved opponents', () => {
  let outDir: string

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'opponents-'))
  })

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it('are none until one is saved, leaving just the baselines', () => {
    expect(loadSavedOpponents(outDir)).toEqual([])
    expect(allOpponents(outDir).map((opponent) => opponent.id)).toEqual(
      BASELINES.map((opponent) => opponent.id),
    )
  })

  it('come back under their own name, after the baselines, sorted', () => {
    save(outDir, 'zulu')
    save(outDir, 'alpha')
    const ids = allOpponents(outDir).map((opponent) => opponent.id)
    expect(ids).toEqual([...BASELINES.map((opponent) => opponent.id), 'alpha', 'zulu'])
    const alpha = readSavedOpponent(outDir, 'alpha')
    expect(alpha?.commander.id).toBe('alpha')
    expect(alpha?.genome).toEqual(genome)
    expect(readSavedOpponent(outDir, 'nobody')).toBeNull()
  })

  it('refuse a file whose name does not match what it says inside', () => {
    save(outDir, 'alpha')
    const body = JSON.stringify({ version: 1, name: 'beta', genome })
    writeFileSync(`${opponentsDir(outDir)}/gamma.json`, body)
    expect(() => loadSavedOpponents(outDir)).toThrow(/gamma\.json/)
  })

  it('name a file that is not a saved opponent at all', () => {
    save(outDir, 'alpha')
    writeFileSync(opponentPath(outDir, 'alpha'), '{"version": 1, "name": "alpha"}')
    expect(() => loadSavedOpponents(outDir)).toThrow(/alpha\.json/)
  })
})

describe('nameProblem', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'names-'))

  it('takes lowercase words joined by hyphens, and a uuid', () => {
    expect(nameProblem(outDir, 'line-holder-2')).toBeNull()
    expect(nameProblem(outDir, '3f2a1c4e-9b7d-4e21-8a55-0c6f1d2e3b4a')).toBeNull()
  })

  it('refuses anything that would make a bad file name or column', () => {
    for (const name of ['', 'Upper', 'two words', '-lead', 'trail-', 'a--b', '../up']) {
      expect(nameProblem(outDir, name)).not.toBeNull()
    }
  })

  it('refuses a baseline name', () => {
    expect(nameProblem(outDir, 'hold-fast')).toMatch(/built-in/)
  })

  it('refuses a name already saved', () => {
    save(outDir, 'taken')
    expect(nameProblem(outDir, 'taken')).toMatch(/already saved/)
    rmSync(outDir, { recursive: true, force: true })
  })
})
