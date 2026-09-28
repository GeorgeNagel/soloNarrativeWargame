/**
 * Champions saved under a name, as opponents for later runs.
 *
 * A saved opponent is a genome written to `artifacts/opponents/<name>.json` at
 * the end of a run. Every fresh run plays all of them, so the set a new champion
 * has to beat grows with each one that is kept.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { baselineById } from './baseline'
import { parseGenome } from './checkpoint'
import type { Genome } from './genome'
import { BASELINE_OPPONENTS, genomeOpponent } from './opponents'
import type { Opponent } from './opponents'
import type { Benchmark } from './tournament'

/** Bumped when the shape below changes in a way older files cannot be read as. */
export const SAVED_OPPONENT_VERSION = 1

export interface SavedOpponent {
  version: number
  name: string
  /** When it was saved, as an ISO timestamp. */
  savedAt: string
  /** The run and genome it came from. */
  source: { runId: string; genomeId: string; generation: number }
  /** Its results in that run's final playoff, one row per opponent. */
  playoff: Benchmark[]
  genome: Genome
}

export function opponentsDir(outDir: string): string {
  return `${outDir}/opponents`
}

export function opponentPath(outDir: string, name: string): string {
  return `${opponentsDir(outDir)}/${name}.json`
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Why a name cannot be used, or null if it can. Names are file names and report
 * columns, so they are kept to lowercase letters, digits and single hyphens, and
 * may not shadow a baseline or an opponent already saved.
 */
export function nameProblem(outDir: string, name: string): string | null {
  if (!NAME.test(name)) return 'use lowercase letters, digits and single hyphens'
  if (baselineById(name)) return `${name} is a built-in opponent`
  if (existsSync(opponentPath(outDir, name))) return `${name} is already saved`
  return null
}

function fail(what: string): never {
  throw new Error(`malformed saved opponent: ${what}`)
}

/** Check a saved opponent read off disk. Only what a run needs is insisted on. */
export function parseSavedOpponent(value: unknown): SavedOpponent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('not an object')
  }
  const saved = value as Record<string, unknown>
  if (saved.version !== SAVED_OPPONENT_VERSION) {
    fail(`version ${String(saved.version)}, this build reads ${SAVED_OPPONENT_VERSION}`)
  }
  if (typeof saved.name !== 'string' || !NAME.test(saved.name)) fail('bad name')
  const source = (saved.source ?? {}) as Record<string, unknown>
  return {
    version: SAVED_OPPONENT_VERSION,
    name: saved.name,
    savedAt: typeof saved.savedAt === 'string' ? saved.savedAt : '',
    source: {
      runId: typeof source.runId === 'string' ? source.runId : '',
      genomeId: typeof source.genomeId === 'string' ? source.genomeId : '',
      generation: typeof source.generation === 'number' ? source.generation : 0,
    },
    playoff: Array.isArray(saved.playoff) ? (saved.playoff as Benchmark[]) : [],
    genome: parseGenome(saved.genome),
  }
}

function readFile(path: string): SavedOpponent {
  try {
    return parseSavedOpponent(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`)
  }
}

/** Read one saved opponent by name, or null if there is no such file. */
export function readSavedOpponent(outDir: string, name: string): Opponent | null {
  const path = opponentPath(outDir, name)
  if (!existsSync(path)) return null
  const saved = readFile(path)
  return genomeOpponent(saved.name, saved.genome)
}

/** Every saved opponent, sorted by name so a run's order never depends on the disk. */
export function loadSavedOpponents(outDir: string): Opponent[] {
  const dir = opponentsDir(outDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const path = `${dir}/${file}`
      const saved = readFile(path)
      if (`${saved.name}.json` !== file) {
        throw new Error(`${path}: saved as ${saved.name}, which does not match the file`)
      }
      return genomeOpponent(saved.name, saved.genome)
    })
}

/** The baselines, then every saved opponent: what a fresh run plays. */
export function allOpponents(outDir: string): Opponent[] {
  return [...BASELINE_OPPONENTS, ...loadSavedOpponents(outDir)]
}

/** Write a champion down as a named opponent. The name must already be checked. */
export function saveOpponent(outDir: string, saved: Omit<SavedOpponent, 'version'>): string {
  const path = opponentPath(outDir, saved.name)
  mkdirSync(opponentsDir(outDir), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ version: SAVED_OPPONENT_VERSION, ...saved }, null, 2)}\n`,
  )
  return path
}
