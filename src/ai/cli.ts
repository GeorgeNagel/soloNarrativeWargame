/**
 * `npm run evolve` — run the genetic algorithm and write the run down.
 *
 * Every knob has a flag and every run is reproducible from `--seed` and the
 * opponents it played, so a result can be re-derived from the line that produced
 * it. Checkpoints are written as the run goes, and `--resume` picks one up and
 * carries on the same stream. At the end the champion can be saved as a named
 * opponent, which every later run then plays.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
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
import type { Genome } from './genome'
import { allOpponents, nameProblem, saveOpponent } from './saved-opponents'
import type { Standing } from './tournament'

interface Flags {
  pop: number
  gens: number
  games: number
  seed: number
  depth: number
  mutation: number
  elites: number
  cap: number
  playoff: number
  outDir: string
  runId: string | null
  checkpointEvery: number
  resume: string | null
  saveAs: string | null
  quiet: boolean
}

const USAGE = `Usage: npm run evolve -- [flags]

  --pop N          population size (default ${DEFAULTS.populationSize})
  --gens N         generations to run (default ${DEFAULTS.generations})
  --games N        boards per generation, shared by every opponent and played
                   from both sides (default ${DEFAULTS.games})
  --seed N         seed for the whole run (default ${DEFAULTS.seed})
  --depth N        maximum tree depth (default ${DEFAULTS.maxDepth})
  --mutation P     per-node mutation chance (default ${DEFAULTS.mutationRate})
  --elites N       top genomes carried over untouched (default ${DEFAULTS.elites})
  --cap N          rounds before a game is a draw (default ${DEFAULTS.roundCap})
  --playoff N      boards in the final playoff between generation leaders (default ${DEFAULTS.playoffGames})
  --out-dir DIR    where runs and saved opponents live (default artifacts)
  --run-id NAME    names this run's directory (default from the settings)
  --every N        write a checkpoint every N generations, 0 for the last only (default 10)
  --resume PATH    carry on from a checkpoint, up to --gens
  --save-as NAME   save the champion as a named opponent without asking
  --quiet          only print the final report
`

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    pop: DEFAULTS.populationSize,
    gens: DEFAULTS.generations,
    games: DEFAULTS.games,
    seed: DEFAULTS.seed,
    depth: DEFAULTS.maxDepth,
    mutation: DEFAULTS.mutationRate,
    elites: DEFAULTS.elites,
    cap: DEFAULTS.roundCap,
    playoff: DEFAULTS.playoffGames,
    outDir: 'artifacts',
    runId: null,
    checkpointEvery: 10,
    resume: null,
    saveAs: null,
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
      case '--playoff':
        flags.playoff = Number(value)
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
      case '--save-as':
        flags.saveAs = value
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
    `games${options.games}`,
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

/** One column per opponent, as wide as its name. */
function opponentWidths(options: ResolvedOptions): number[] {
  return options.opponents.map((opponent) => Math.max(5, opponent.id.length))
}

function header(options: ResolvedOptions): string {
  const widths = opponentWidths(options)
  return [
    pad('gen', 4),
    pad('best', 7),
    pad('mean', 7),
    pad('worst', 7),
    pad('rounds', 7),
    pad('nodes', 7),
    ...options.opponents.map((opponent, index) => pad(opponent.id, widths[index])),
  ].join(' ')
}

function line(report: GenerationReport, options: ResolvedOptions): string {
  const widths = opponentWidths(options)
  return [
    pad(`${report.generation}`, 4),
    pad(num(report.best), 7),
    pad(num(report.mean), 7),
    pad(num(report.worst), 7),
    pad(num(report.rounds, 1), 7),
    pad(num(report.nodes, 1), 7),
    ...report.against.map((mark, index) => pad(num(mark.winRate), widths[index])),
  ].join(' ')
}

/** The champion's line against each opponent, as the report and champion.txt print it. */
function summary(standing: Standing): string[] {
  const width = Math.max(...standing.against.map((mark) => mark.opponent.length))
  return standing.against.map(
    (mark) =>
      `vs ${pad(mark.opponent, width)}  ${mark.wins}W ${mark.draws}D ${mark.losses}L ` +
      `- win rate ${num(mark.winRate)}, differential ${num(mark.differential)}`,
  )
}

const PLAYOFF_SHOWN = 5

function playoffTable(playoff: Standing[]): string[] {
  const rows = playoff.slice(0, PLAYOFF_SHOWN).map(
    (standing, index) =>
      `  ${pad(`${index + 1}`, 3)} ${pad(standing.genome.id, 10)} ` +
      `${pad(`gen ${standing.genome.generation}`, 8)} score ${num(standing.score)}  ` +
      `${standing.wins}W ${standing.draws}D ${standing.losses}L`,
  )
  const rest = playoff.length - PLAYOFF_SHOWN
  return rest > 0 ? [...rows, `  ... and ${rest} more`] : rows
}

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

// ── saving the champion ───────────────────────────────────

/**
 * Ask whether to keep the champion as an opponent, and under what name. An empty
 * name takes the generated one; a name that cannot be used is asked for again.
 */
async function askForName(outDir: string): Promise<string | null> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const keep = (await prompt.question('Save champion as a named opponent? [Y/n] '))
      .trim()
      .toLowerCase()
    if (keep !== '' && keep !== 'y' && keep !== 'yes') return null
    const fallback = randomUUID()
    for (;;) {
      const name = (await prompt.question(`Name [${fallback}]: `)).trim() || fallback
      const problem = nameProblem(outDir, name)
      if (!problem) return name
      process.stdout.write(`  ${problem}\n`)
    }
  } finally {
    prompt.close()
  }
}

function saveChampion(
  outDir: string,
  name: string,
  runId: string,
  standing: Standing,
): string {
  const genome: Genome = standing.genome
  return saveOpponent(outDir, {
    name,
    savedAt: new Date().toISOString(),
    source: { runId, genomeId: genome.id, generation: genome.generation },
    playoff: standing.against,
    genome,
  })
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const say = (text: string) => process.stdout.write(`${text}\n`)

  // checked before the run, so a bad name does not cost a run's worth of waiting
  if (flags.saveAs !== null) {
    const problem = nameProblem(flags.outDir, flags.saveAs)
    if (problem) throw new Error(`--save-as ${flags.saveAs}: ${problem}`)
  }

  let from: RunState | undefined
  let resumed: ResolvedOptions | undefined
  let resumedId: string | undefined
  if (flags.resume) {
    const checkpoint = parseCheckpoint(JSON.parse(readFileSync(flags.resume, 'utf8')))
    // the settings and the opponents come from the checkpoint; only the
    // generation count is the caller's to change, since everything else would
    // invalidate the run so far
    const back = fromCheckpoint(checkpoint, { generations: flags.gens })
    from = back.state
    resumed = back.options
    // a resumed run is the same run carried further, so its checkpoints belong
    // next to the ones already written rather than in a directory of their own
    resumedId = checkpoint.runId
    if (from.generation >= resumed.generations) {
      throw new Error(
        `checkpoint is already at generation ${from.generation}; ` +
          `pass --gens above that to carry on`,
      )
    }
    say(
      `resuming ${checkpoint.runId} from generation ${from.generation} ` +
        `(${flags.resume}) up to generation ${resumed.generations}`,
    )
  }

  const settled: ResolvedOptions = resumed ?? {
    ...DEFAULTS,
    populationSize: flags.pop,
    generations: flags.gens,
    games: flags.games,
    seed: flags.seed,
    roundCap: flags.cap,
    maxDepth: flags.depth,
    mutationRate: flags.mutation,
    elites: flags.elites,
    playoffGames: flags.playoff,
    opponents: allOpponents(flags.outDir),
  }
  const runId = flags.runId ?? resumedId ?? defaultRunId(settled)
  const paths = runPaths(flags.outDir, runId)

  if (!flags.quiet) {
    if (!from) {
      say(
        `evolving ${settled.populationSize} genomes over ${settled.generations} generations ` +
          `(seed ${settled.seed}, ${settled.games} boards a generation) against ` +
          settled.opponents.map((opponent) => opponent.id).join(', '),
      )
    }
    say(header(settled))
  }

  const started = Date.now()
  const result = evolve(
    settled,
    {
      onGeneration: (report, state) => {
        if (!flags.quiet) say(line(report, settled))
        const last = state.generation === settled.generations
        const due =
          flags.checkpointEvery > 0 && state.generation % flags.checkpointEvery === 0
        if (last || due) writeCheckpoint(paths, runId, state, settled)
      },
    },
    from,
  )
  const seconds = (Date.now() - started) / 1000

  const winner = result.playoff[0]
  const champion = winner.genome
  say('')
  say(
    `playoff: ${result.playoff.length} generation leaders over ` +
      `${settled.playoffGames} new boards`,
  )
  for (const row of playoffTable(result.playoff)) say(row)
  say('')
  say(
    `champion ${champion.id} (generation ${champion.generation}) - ` +
      `${genomeSize(champion)} nodes, ${num(seconds, 1)}s`,
  )
  for (const row of summary(winner)) say(`  ${row}`)
  say('')
  say(describeGenome(champion))

  const standingRow = (standing: Standing) => ({
    id: standing.genome.id,
    generation: standing.genome.generation,
    score: standing.score,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    differential: standing.differential,
    against: standing.against,
  })
  const { opponents: _opponents, ...options } = serializeOptions(result.options)
  write(
    paths.run,
    `${JSON.stringify(
      {
        runId,
        // the opponents by name only; the checkpoints hold them in full
        options: { ...options, opponents: result.options.opponents.map((o) => o.id) },
        seconds,
        champion: champion.id,
        playoff: result.playoff.map(standingRow),
        reports: result.reports,
        standings: result.standings.map(standingRow),
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
      `champion of ${runId}, from the playoff over ${settled.playoffGames} boards`,
      '',
      ...summary(winner),
      '',
      describeGenome(champion),
      '',
    ].join('\n'),
  )
  say(`\nwrote ${paths.root}/`)

  // without a terminal nothing is saved unless it was asked for, so scripted
  // runs do not fill the opponents directory with generated names
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const name = flags.saveAs ?? (interactive ? await askForName(flags.outDir) : null)
  if (name !== null) {
    say(`saved ${saveChampion(flags.outDir, name, runId, winner)}`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
})
