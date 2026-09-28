/**
 * Reading and writing a run.
 *
 * A checkpoint is a whole `RunState` written down: the ranked population, the
 * curve so far, every generation's leader, the opponents, and the generator's
 * state, which is what lets a resumed run carry on the same stream instead of
 * starting a new one. Everything in a genome is already plain data, so a
 * checkpoint is plain JSON and needs no revival step beyond being checked.
 *
 * These files are committed, so they are also hand-editable, and everything
 * loaded from one is validated rather than trusted.
 */
import { UNIT_TYPES } from '../prototypes/tactical/model'
import type { RoundOrder, UnitType } from '../prototypes/tactical/model'
import { resolveOptions } from './evolve'
import type { GenerationReport, ResolvedOptions, RunState } from './evolve'
import type { Genome } from './genome'
import { fromOpponentRecord, toOpponentRecord } from './opponents'
import type { OpponentRecord } from './opponents'
import { rngFromState } from './rng'
import type { Benchmark, Standing } from './tournament'
import type { Tree } from './tree'

/**
 * Bumped when the shape below changes in a way older files cannot be read as.
 * Version 1 was the round robin, scored genome against genome.
 */
export const CHECKPOINT_VERSION = 2

/** A ranking row, pointing at the population entry of the same index. */
export interface StandingRecord {
  id: string
  score: number
  games: number
  wins: number
  draws: number
  losses: number
  differential: number
  rounds: number
  against: Benchmark[]
}

/**
 * `ResolvedOptions` with the opponents written out: baselines by name, saved
 * genomes in full, so a resumed run plays exactly what the first part played
 * even if opponents have been saved since.
 */
export interface CheckpointOptions {
  populationSize: number
  generations: number
  games: number
  seed: number
  roundCap: number
  maxDepth: number
  mutationRate: number
  survivorFraction: number
  elites: number
  playoffGames: number
  opponents: OpponentRecord[]
}

export interface Checkpoint {
  version: number
  /** Names the run these files belong to. */
  runId: string
  /** The generation the population has been ranked in. */
  generation: number
  /** The generator's state, so resuming continues the same stream. */
  rngState: number
  options: CheckpointOptions
  /** One report per generation so far, oldest first. */
  reports: GenerationReport[]
  /** Every generation's leader so far, for the playoff at the end. */
  winners: Genome[]
  /** The population in ranked order — `population[0]` is the leader. */
  population: Genome[]
  /** The ranking, row `i` describing `population[i]`. */
  standings: StandingRecord[]
}

export function serializeOptions(options: ResolvedOptions): CheckpointOptions {
  return {
    populationSize: options.populationSize,
    generations: options.generations,
    games: options.games,
    seed: options.seed,
    roundCap: options.roundCap,
    maxDepth: options.maxDepth,
    mutationRate: options.mutationRate,
    survivorFraction: options.survivorFraction,
    elites: options.elites,
    playoffGames: options.playoffGames,
    opponents: options.opponents.map(toOpponentRecord),
  }
}

/**
 * The options a checkpoint stored, with anything the caller passed taking
 * precedence — which is how a resumed run is told to go further than the one
 * that wrote the file.
 */
export function deserializeOptions(
  saved: CheckpointOptions,
  overrides: Partial<ResolvedOptions> = {},
): ResolvedOptions {
  const { opponents, ...rest } = saved
  return resolveOptions({
    ...rest,
    opponents: opponents.map(fromOpponentRecord),
    ...overrides,
  })
}

export function toCheckpoint(
  runId: string,
  state: RunState,
  options: ResolvedOptions,
): Checkpoint {
  return {
    version: CHECKPOINT_VERSION,
    runId,
    generation: state.generation,
    rngState: state.rng.state(),
    options: serializeOptions(options),
    reports: state.reports,
    winners: state.winners,
    population: state.standings.map((standing) => standing.genome),
    standings: state.standings.map((standing) => ({
      id: standing.genome.id,
      score: standing.score,
      games: standing.games,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      differential: standing.differential,
      rounds: standing.rounds,
      against: standing.against,
    })),
  }
}

/** A checkpoint as a run that `evolve` can be handed to carry on from. */
export function fromCheckpoint(
  checkpoint: Checkpoint,
  overrides: Partial<ResolvedOptions> = {},
): { state: RunState; options: ResolvedOptions } {
  const standings: Standing[] = checkpoint.population.map((genome, index) => {
    const { id: _id, ...record } = checkpoint.standings[index]
    return { genome, ...record }
  })
  return {
    state: {
      generation: checkpoint.generation,
      standings,
      reports: checkpoint.reports,
      winners: checkpoint.winners,
      rng: rngFromState(checkpoint.rngState),
    },
    options: deserializeOptions(checkpoint.options, overrides),
  }
}

// ── validation ────────────────────────────────────────────

function fail(what: string): never {
  throw new Error(`malformed checkpoint: ${what}`)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} is not an object`)
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${what} is not a finite number`)
  }
  return value
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(`${what} is not a string`)
  return value
}

function asList(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(`${what} is not a list`)
  return value
}

/**
 * Check a tree's shape, and its leaves with the caller's check.
 *
 * A branch on a feature nothing provides is left alone: `evaluate` reads a
 * missing feature as zero on purpose, so an old checkpoint still loads after a
 * feature has been renamed, rather than being rejected outright.
 */
function parseTree<L>(value: unknown, leaf: (value: unknown) => L, what: string): Tree<L> {
  const node = asRecord(value, what)
  if (node.kind === 'leaf') {
    return { kind: 'leaf', value: leaf(node.value) }
  }
  if (node.kind !== 'branch') fail(`${what} has no kind`)
  return {
    kind: 'branch',
    feature: asString(node.feature, `${what}.feature`),
    threshold: asNumber(node.threshold, `${what}.threshold`),
    below: parseTree(node.below, leaf, `${what}.below`),
    atOrAbove: parseTree(node.atOrAbove, leaf, `${what}.atOrAbove`),
  }
}

function parseOrder(value: unknown): RoundOrder {
  const order = asRecord(value, 'an order')
  return {
    before: asNumber(order.before, 'order.before'),
    advance: asNumber(order.advance, 'order.advance'),
    after: asNumber(order.after, 'order.after'),
  }
}

/** Check a genome, from a checkpoint or from a hand-written file. */
export function parseGenome(value: unknown): Genome {
  const genome = asRecord(value, 'a genome')
  const units = {} as Record<UnitType, Tree<RoundOrder>>
  const trees = asRecord(genome.units, 'genome.units')
  for (const type of UNIT_TYPES) {
    if (trees[type] === undefined) fail(`genome.units is missing ${type}`)
    units[type] = parseTree(trees[type], parseOrder, `genome.units.${type}`)
  }
  return {
    id: asString(genome.id, 'genome.id'),
    generation: asNumber(genome.generation, 'genome.generation'),
    army: parseTree(
      genome.army,
      (leaf) => asNumber(leaf, 'a posture'),
      'genome.army',
    ),
    units,
  }
}

function parseBenchmark(value: unknown, what: string): Benchmark {
  const mark = asRecord(value, what)
  return {
    opponent: asString(mark.opponent, `${what}.opponent`),
    games: asNumber(mark.games, `${what}.games`),
    wins: asNumber(mark.wins, `${what}.wins`),
    draws: asNumber(mark.draws, `${what}.draws`),
    losses: asNumber(mark.losses, `${what}.losses`),
    winRate: asNumber(mark.winRate, `${what}.winRate`),
    score: asNumber(mark.score, `${what}.score`),
    differential: asNumber(mark.differential, `${what}.differential`),
    rounds: asNumber(mark.rounds, `${what}.rounds`),
  }
}

function parseOpponentRecord(value: unknown, what: string): OpponentRecord {
  const record = asRecord(value, what)
  return {
    id: asString(record.id, `${what}.id`),
    genome: record.genome === null ? null : parseGenome(record.genome),
  }
}

/** Check a checkpoint read off disk, field by field. */
export function parseCheckpoint(value: unknown): Checkpoint {
  const checkpoint = asRecord(value, 'the checkpoint')
  const version = asNumber(checkpoint.version, 'version')
  if (version !== CHECKPOINT_VERSION) {
    throw new Error(
      `checkpoint is version ${version}, this build reads version ${CHECKPOINT_VERSION}` +
        (version === 1
          ? ' (version 1 checkpoints come from the round-robin fitness and cannot be resumed)'
          : ''),
    )
  }
  const population = asList(checkpoint.population, 'population')
  const standings = asList(checkpoint.standings, 'standings')
  const reports = asList(checkpoint.reports, 'reports')
  const winners = asList(checkpoint.winners, 'winners')
  if (population.length !== standings.length) {
    fail('population and standings are different lengths')
  }
  if (population.length === 0) fail('population is empty')

  const options = asRecord(checkpoint.options, 'options')
  const opponents = asList(options.opponents, 'options.opponents').map((record, index) =>
    parseOpponentRecord(record, `options.opponents[${index}]`),
  )
  if (opponents.length === 0) fail('options.opponents is empty')

  return {
    version,
    runId: asString(checkpoint.runId, 'runId'),
    generation: asNumber(checkpoint.generation, 'generation'),
    rngState: asNumber(checkpoint.rngState, 'rngState'),
    options: {
      populationSize: asNumber(options.populationSize, 'options.populationSize'),
      generations: asNumber(options.generations, 'options.generations'),
      games: asNumber(options.games, 'options.games'),
      seed: asNumber(options.seed, 'options.seed'),
      roundCap: asNumber(options.roundCap, 'options.roundCap'),
      maxDepth: asNumber(options.maxDepth, 'options.maxDepth'),
      mutationRate: asNumber(options.mutationRate, 'options.mutationRate'),
      survivorFraction: asNumber(options.survivorFraction, 'options.survivorFraction'),
      elites: asNumber(options.elites, 'options.elites'),
      playoffGames: asNumber(options.playoffGames, 'options.playoffGames'),
      opponents,
    },
    reports: reports as GenerationReport[],
    winners: winners.map(parseGenome),
    population: population.map(parseGenome),
    standings: standings.map((row, index) => {
      const what = `standings[${index}]`
      const record = asRecord(row, what)
      return {
        id: asString(record.id, `${what}.id`),
        score: asNumber(record.score, `${what}.score`),
        games: asNumber(record.games, `${what}.games`),
        wins: asNumber(record.wins, `${what}.wins`),
        draws: asNumber(record.draws, `${what}.draws`),
        losses: asNumber(record.losses, `${what}.losses`),
        differential: asNumber(record.differential, `${what}.differential`),
        rounds: asNumber(record.rounds, `${what}.rounds`),
        against: asList(record.against, `${what}.against`).map((mark, at) =>
          parseBenchmark(mark, `${what}.against[${at}]`),
        ),
      }
    }),
  }
}

// ── where the files go ────────────────────────────────────

/** Everything one run writes, under the artifacts directory. */
export interface RunPaths {
  root: string
  /** Options, the whole curve, and the final ranking. */
  run: string
  /** The curve again, as something a spreadsheet can plot. */
  curve: string
  /** The champion genome, loadable by `npm run ai:play`. */
  champion: string
  /** The champion's trees as indented text. */
  championText: string
  checkpoints: string
}

export function runPaths(outDir: string, runId: string): RunPaths {
  const root = `${outDir}/runs/${runId}`
  return {
    root,
    run: `${root}/run.json`,
    curve: `${root}/curve.csv`,
    champion: `${root}/champion.json`,
    championText: `${root}/champion.txt`,
    checkpoints: `${root}/checkpoints`,
  }
}

/** `gen-0007.json`, so a directory listing sorts in order. */
export function checkpointName(generation: number): string {
  return `gen-${String(generation).padStart(4, '0')}.json`
}

/** The curve as CSV, one row per generation, with the leader's line per opponent. */
export function curveCsv(reports: GenerationReport[]): string {
  const opponents = reports[0]?.against.map((mark) => mark.opponent) ?? []
  const header = [
    'generation',
    'best',
    'mean',
    'worst',
    'rounds',
    'nodes',
    ...opponents.flatMap((opponent) => [`${opponent}.winRate`, `${opponent}.differential`]),
  ]
  const rows = reports.map((report) =>
    [
      report.generation,
      report.best,
      report.mean,
      report.worst,
      report.rounds,
      report.nodes,
      ...report.against.flatMap((mark) => [mark.winRate, mark.differential]),
    ].join(','),
  )
  return [header.join(','), ...rows, ''].join('\n')
}
