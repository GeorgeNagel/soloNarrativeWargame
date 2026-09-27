/**
 * `npm run evolve` — run the genetic algorithm and write the run down.
 *
 * Every knob has a flag and every run is reproducible from `--seed`, so a result
 * can be re-derived from the line that produced it. Checkpoints are written as
 * the run goes, and `--resume` picks one up and carries on the same stream.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { BASELINES } from './baseline'
import {
  checkpointName,
  curveCsv,
  fromCheckpoint,
  parseCheckpoint,
  runPaths,
  serializeOptions,
  toCheckpoint,
} from './checkpoint'
import type { RunPaths } from './checkpoint'
import { describeGenome } from './describe'
import { DEFAULTS, evolve } from './evolve'
import type { GenerationReport, ResolvedOptions, RunState } from './evolve'
import { genomeSize } from './genome'
import { benchmark } from './tournament'

interface Flags {
  pop: number
  gens: number
  games: number
  seed: number
  depth: number
  mutation: number
  elites: number
  cap: number
  bench: number
  outDir: string
  runId: string | null
  checkpointEvery: number
  resume: string | null
  quiet: boolean
}

const USAGE = `Usage: npm run evolve -- [flags]

  --pop N          population size (default ${DEFAULTS.populationSize})
  --gens N         generations to run (default ${DEFAULTS.generations})
  --games N        scenarios per pairing, each played from both sides (default ${DEFAULTS.gamesPerPairing})
  --seed N         seed for the whole run (default ${DEFAULTS.seed})
  --depth N        maximum tree depth (default ${DEFAULTS.maxDepth})
  --mutation P     per-node mutation chance (default ${DEFAULTS.mutationRate})
  --elites N       top genomes carried over untouched (default ${DEFAULTS.elites})
  --cap N          rounds before a game is a draw (default ${DEFAULTS.roundCap})
  --bench N        benchmark scenarios per generation, 0 to skip (default ${DEFAULTS.benchmarkGames})
  --out-dir DIR    where runs are written (default artifacts)
  --run-id NAME    names this run's directory (default from the settings)
  --every N        write a checkpoint every N generations, 0 for the last only (default 10)
  --resume PATH    carry on from a checkpoint, up to --gens
  --quiet          only print the final report
`

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    pop: DEFAULTS.populationSize,
    gens: DEFAULTS.generations,
    games: DEFAULTS.gamesPerPairing,
    seed: DEFAULTS.seed,
    depth: DEFAULTS.maxDepth,
    mutation: DEFAULTS.mutationRate,
    elites: DEFAULTS.elites,
    cap: DEFAULTS.roundCap,
    bench: DEFAULTS.benchmarkGames,
    outDir: 'artifacts',
    runId: null,
    checkpointEvery: 10,
    resume: null,
    quiet: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(USAGE)
      process.exit(0)
    }
    if (flag === '--quiet') {
      flags.quiet = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    i += 1
    switch (flag) {
      case '--pop':
        flags.pop = Number(value)
        break
      case '--gens':
        flags.gens = Number(value)
        break
      case '--games':
        flags.games = Number(value)
        break
      case '--seed':
        flags.seed = Number(value)
        break
      case '--depth':
        flags.depth = Number(value)
        break
      case '--mutation':
        flags.mutation = Number(value)
        break
      case '--elites':
        flags.elites = Number(value)
        break
      case '--cap':
        flags.cap = Number(value)
        break
      case '--bench':
        flags.bench = Number(value)
        break
      case '--out-dir':
        flags.outDir = value
        break
      case '--run-id':
        flags.runId = value
        break
      case '--every':
        flags.checkpointEvery = Number(value)
        break
      case '--resume':
        flags.resume = value
        break
      default:
        throw new Error(`unknown flag ${flag}\n\n${USAGE}`)
    }
  }

  return flags
}

/** A run's default name, which says what produced it and nothing that drifts. */
function defaultRunId(options: ResolvedOptions): string {
  return [
    `pop${options.populationSize}`,
    `gen${options.generations}`,
    `games${options.gamesPerPairing}`,
    `depth${options.maxDepth}`,
    `seed${options.seed}`,
  ].join('-')
}

// ── printing ──────────────────────────────────────────────

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`
}

function num(value: number, digits = 3): string {
  return value.toFixed(digits)
}

function line(report: GenerationReport): string {
  const bench =
    report.benchmarks.length > 0
      ? report.benchmarks.map((mark) => num(mark.winRate)).join('  ')
      : '  —'
  return [
    pad(`${report.generation}`, 4),
    pad(num(report.best), 7),
    pad(num(report.mean), 7),
    pad(num(report.worst), 7),
    pad(num(report.rounds, 1), 7),
    pad(num(report.nodes, 1), 7),
    pad(num(report.sideBias), 8),
    bench,
  ].join(' ')
}

const HEADER = [
  pad('gen', 4),
  pad('best', 7),
  pad('mean', 7),
  pad('worst', 7),
  pad('rounds', 7),
  pad('nodes', 7),
  pad('bias', 8),
  BASELINES.map((opponent) => opponent.id).join('  '),
].join(' ')

// ── writing the run down ──────────────────────────────────

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

/** Checkpoints are written compact: a pretty-printed tree is thousands of lines. */
function writeCheckpoint(
  paths: RunPaths,
  runId: string,
  state: RunState,
  options: ResolvedOptions,
): string {
  const path = `${paths.checkpoints}/${checkpointName(state.generation)}`
  write(path, `${JSON.stringify(toCheckpoint(runId, state, options))}\n`)
  return path
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2))
  const say = (text: string) => process.stdout.write(`${text}\n`)

  const overrides = {
    populationSize: flags.pop,
    generations: flags.gens,
    gamesPerPairing: flags.games,
    seed: flags.seed,
    roundCap: flags.cap,
    maxDepth: flags.depth,
    mutationRate: flags.mutation,
    elites: flags.elites,
    benchmarkGames: flags.bench,
  }

  let from: RunState | undefined
  let options: ResolvedOptions | undefined
  let resumedId: string | undefined
  if (flags.resume) {
    const checkpoint = parseCheckpoint(JSON.parse(readFileSync(flags.resume, 'utf8')))
    // the settings come from the checkpoint; only the generation count is the
    // caller's to change, since everything else would invalidate the run so far
    const resumed = fromCheckpoint(checkpoint, { generations: flags.gens })
    from = resumed.state
    options = resumed.options
    // a resumed run is the same run carried further, so its checkpoints belong
    // next to the ones already written rather than in a directory of their own
    resumedId = checkpoint.runId
    if (from.generation >= options.generations) {
      throw new Error(
        `checkpoint is already at generation ${from.generation}; ` +
          `pass --gens above that to carry on`,
      )
    }
    say(
      `resuming ${checkpoint.runId} from generation ${from.generation} ` +
        `(${flags.resume}) up to generation ${options.generations}`,
    )
  }

  const settled = options ?? { ...DEFAULTS, ...overrides }
  const runId = flags.runId ?? resumedId ?? defaultRunId(settled)
  const paths = runPaths(flags.outDir, runId)

  if (!flags.quiet) {
    if (!from) {
      say(
        `evolving ${settled.populationSize} genomes over ${settled.generations} generations ` +
          `(seed ${settled.seed}, ${settled.gamesPerPairing} scenarios per pairing)`,
      )
    }
    say(HEADER)
  }

  const started = Date.now()
  const result = evolve(
    options ?? overrides,
    {
      onGeneration: (report, state) => {
        if (!flags.quiet) say(line(report))
        const last = state.generation === settled.generations
        const due =
          flags.checkpointEvery > 0 && state.generation % flags.checkpointEvery === 0
        if (last || due) writeCheckpoint(paths, runId, state, settled)
      },
    },
    from,
  )
  const seconds = (Date.now() - started) / 1000

  const champion = result.champion
  const marks = BASELINES.map((opponent) =>
    benchmark(champion, opponent, {
      games: Math.max(20, flags.bench),
      seed: settled.seed + 1000,
      roundCap: settled.roundCap,
    }),
  )

  const summary = marks.map(
    (mark) =>
      `  vs ${pad(mark.opponent, 18)} ${mark.wins}W ${mark.draws}D ${mark.losses}L ` +
      `— win rate ${num(mark.winRate)}, differential ${num(mark.differential)}`,
  )
  say('')
  say(`champion ${champion.id} — ${genomeSize(champion)} nodes, ${num(seconds, 1)}s`)
  for (const row of summary) say(row)
  say('')
  say(describeGenome(champion))

  write(
    paths.run,
    `${JSON.stringify(
      {
        runId,
        options: serializeOptions(result.options),
        seconds,
        champion: champion.id,
        finalBenchmarks: marks,
        reports: result.reports,
        standings: result.standings.map((standing) => ({
          id: standing.genome.id,
          score: standing.score,
          wins: standing.wins,
          draws: standing.draws,
          losses: standing.losses,
          differential: standing.differential,
        })),
      },
      null,
      2,
    )}\n`,
  )
  write(paths.curve, curveCsv(result.reports))
  write(paths.champion, `${JSON.stringify(champion)}\n`)
  write(
    paths.championText,
    [
      `champion of ${runId}`,
      '',
      ...summary.map((row) => row.trim()),
      '',
      describeGenome(champion),
      '',
    ].join('\n'),
  )
  say(`\nwrote ${paths.root}/`)
}

main()
