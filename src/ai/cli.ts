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
import { ANNEAL_SHAPES, DEFAULTS, evolve, resolveOptions } from './evolve'
import type {
  AnnealShape,
  EvolveResult,
  GenerationReport,
  ResolvedOptions,
  RunState,
} from './evolve'
import { genomeSize } from './genome'
import type { Genome } from './genome'
import { allOpponents, nameProblem, saveOpponent } from './saved-opponents'
import type { Standing } from './tournament'
import type { MutationWeights } from './tree'

interface Flags {
  pop: number
  gens: number
  games: number
  seed: number
  depth: number
  mutation: number
  mutationEnd: number | null
  anneal: AnnealShape
  annealGens: number | null
  mutationWeights: MutationWeights
  attackDealt: number
  attackTaken: number
  shapingGens: number | null
  crossover: number
  survivors: number
  tournament: number
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
  --mutation P     per-node mutation chance in the first bred generation
                   (default ${DEFAULTS.mutationRate})
  --mutation-end P per-node mutation chance once annealing is done; the rate
                   moves from --mutation to this (default: same as --mutation,
                   no annealing)
  --anneal SHAPE   linear: equal steps; geometric: equal factors, falling fast
                   early and gently late (default ${DEFAULTS.annealShape})
  --anneal-gens N  generations the rate takes to reach --mutation-end, holding
                   there after (default: --gens)
  --mutation-mix W relative odds of each kind of mutation, as KIND=N pairs
                   separated by commas; unnamed kinds keep their default
                   (default ${weightsText(DEFAULTS.mutationWeights)})
                     threshold  move a branch's threshold one step
                     feature    point a branch at a different feature
                     nudge      nudge a leaf's order or posture
                     replace    replace a leaf's order or posture outright
                     structure  regrow a subtree, or collapse a branch
  --attack-dealt W score an attacking game earns per unit of enemy strength
                   removed, in generation 0 (default ${DEFAULTS.attackDealt})
  --attack-taken W score an attacking game loses per unit of own strength lost,
                   in generation 0 (default ${DEFAULTS.attackTaken}); the two must
                   sum to at most 1. Both move linearly back to
                   ${DEFAULTS.attackDealt}/${DEFAULTS.attackTaken}, the plain differential. The playoff always
                   scores on the plain differential
  --shaping-gens N generations the attack weights take to return to the plain
                   differential, holding there after (default: --gens)
  --crossover P    per-tree chance a child is crossed from both parents rather
                   than copied from one (default ${DEFAULTS.crossoverRate})
  --survivors F    fraction of the ranking that breeds (default ${DEFAULTS.survivorFraction})
  --tournament N   survivors drawn per parent pick, best wins; 1 is uniform,
                   higher favours the leaders more (default ${DEFAULTS.tournamentSize})
  --elites N       top genomes carried over untouched (default ${DEFAULTS.elites})
  --cap N          rounds before a game is called off (default ${DEFAULTS.roundCap})
  --playoff N      boards in the final playoff between generation leaders (default ${DEFAULTS.playoffGames})
  --out-dir DIR    where runs and saved opponents live (default artifacts)
  --run-id NAME    names this run's directory (default from the settings)
  --every N        write a checkpoint every N generations, 0 for the last only (default 10)
  --resume PATH    carry on from a checkpoint, up to --gens
  --save-as NAME   save the champion as a named opponent without asking
  --quiet          only print the final report
`

function weightsText(weights: MutationWeights): string {
  return Object.entries(weights)
    .map(([kind, weight]) => `${kind}=${weight}`)
    .join(',')
}

/** `threshold=4,structure=0` onto `base`, so a flag names only what it changes. */
function parseWeights(text: string, base: MutationWeights): MutationWeights {
  const weights = { ...base }
  for (const pair of text.split(',')) {
    const [kind, amount] = pair.split('=')
    if (!(kind in weights) || amount === undefined || amount.trim() === '') {
      throw new Error(
        `--mutation-mix: expected KIND=N with KIND one of ` +
          `${Object.keys(weights).join(', ')}, got "${pair}"`,
      )
    }
    weights[kind as keyof MutationWeights] = Number(amount)
  }
  return weights
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    pop: DEFAULTS.populationSize,
    gens: DEFAULTS.generations,
    games: DEFAULTS.games,
    seed: DEFAULTS.seed,
    depth: DEFAULTS.maxDepth,
    mutation: DEFAULTS.mutationRate,
    mutationEnd: null,
    anneal: DEFAULTS.annealShape,
    annealGens: null,
    mutationWeights: DEFAULTS.mutationWeights,
    attackDealt: DEFAULTS.attackDealt,
    attackTaken: DEFAULTS.attackTaken,
    shapingGens: null,
    crossover: DEFAULTS.crossoverRate,
    survivors: DEFAULTS.survivorFraction,
    tournament: DEFAULTS.tournamentSize,
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
      case '--mutation-end':
        flags.mutationEnd = Number(value)
        break
      case '--anneal':
        if (!ANNEAL_SHAPES.includes(value as AnnealShape)) {
          throw new Error(`--anneal: expected one of ${ANNEAL_SHAPES.join(', ')}, got "${value}"`)
        }
        flags.anneal = value as AnnealShape
        break
      case '--anneal-gens':
        flags.annealGens = Number(value)
        break
      case '--mutation-mix':
        flags.mutationWeights = parseWeights(value, flags.mutationWeights)
        break
      case '--attack-dealt':
        flags.attackDealt = Number(value)
        break
      case '--attack-taken':
        flags.attackTaken = Number(value)
        break
      case '--shaping-gens':
        flags.shapingGens = Number(value)
        break
      case '--crossover':
        flags.crossover = Number(value)
        break
      case '--survivors':
        flags.survivors = Number(value)
        break
      case '--tournament':
        flags.tournament = Number(value)
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

/**
 * A run's default name, which says what produced it and nothing that drifts.
 * Breeding settings appear only when they differ from the defaults, so two runs
 * that differ only in how they breed do not share a directory.
 */
function defaultRunId(options: ResolvedOptions): string {
  const parts = [
    `pop${options.populationSize}`,
    `gen${options.generations}`,
    `games${options.games}`,
    `depth${options.maxDepth}`,
  ]
  const annealed = options.finalMutationRate !== options.mutationRate
  if (annealed) {
    parts.push(
      `mut${options.mutationRate}to${options.finalMutationRate}` +
        `${options.annealShape === 'linear' ? 'lin' : 'geo'}` +
        `${options.annealGenerations === options.generations ? '' : `over${options.annealGenerations}`}`,
    )
  } else if (options.mutationRate !== DEFAULTS.mutationRate) {
    parts.push(`mut${options.mutationRate}`)
  }
  const mix = Object.values(options.mutationWeights)
  if (mix.join() !== Object.values(DEFAULTS.mutationWeights).join()) {
    parts.push(`mix${mix.join('.')}`)
  }
  const shaped =
    options.attackDealt !== DEFAULTS.attackDealt ||
    options.attackTaken !== DEFAULTS.attackTaken
  if (shaped) {
    parts.push(
      `atk${options.attackDealt}-${options.attackTaken}` +
        `${options.shapingGenerations === options.generations ? '' : `over${options.shapingGenerations}`}`,
    )
  }
  if (options.crossoverRate !== DEFAULTS.crossoverRate) parts.push(`xo${options.crossoverRate}`)
  if (options.survivorFraction !== DEFAULTS.survivorFraction) {
    parts.push(`surv${options.survivorFraction}`)
  }
  if (options.tournamentSize !== DEFAULTS.tournamentSize) parts.push(`tour${options.tournamentSize}`)
  parts.push(`seed${options.seed}`)
  return parts.join('-')
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
    pad('mut', 6),
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
    pad(num(report.mutation), 6),
    ...report.against.map((mark, index) => pad(num(mark.winRate), widths[index])),
  ].join(' ')
}

/** The champion's line against each opponent, as the report and champion.txt print it. */
function summary(standing: Standing): string[] {
  const width = Math.max(...standing.against.map((mark) => mark.opponent.length))
  return standing.against.map(
    (mark) =>
      `vs ${pad(mark.opponent, width)}  ${mark.wins}W ${mark.losses}L ` +
      `- win rate ${num(mark.winRate)}, differential ${num(mark.differential)}`,
  )
}

const PLAYOFF_SHOWN = 5

function playoffTable(playoff: Standing[]): string[] {
  const rows = playoff.slice(0, PLAYOFF_SHOWN).map(
    (standing, index) =>
      `  ${pad(`${index + 1}`, 3)} ${pad(standing.genome.id, 10)} ` +
      `${pad(`gen ${standing.genome.generation}`, 8)} score ${num(standing.score)}  ` +
      `${standing.wins}W ${standing.losses}L`,
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

// ── carrying on ───────────────────────────────────────────

/**
 * Ask whether to run more generations, and how many. Null when the run should
 * stop; a count that is not a whole number above zero is asked for again.
 */
async function askForMore(): Promise<number | null> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const more = (await prompt.question('Continue evolving? [y/N] ')).trim().toLowerCase()
    if (more !== 'y' && more !== 'yes') return null
    for (;;) {
      const count = Number((await prompt.question('How many more generations? ')).trim())
      if (Number.isInteger(count) && count >= 1) return count
      process.stdout.write('  expected a whole number of at least 1\n')
    }
  } finally {
    prompt.close()
  }
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

/**
 * The playoff, the champion and its trees, printed and written into the run's
 * directory. A run that carries on writes them again over the old ones.
 */
function reportRun(
  result: EvolveResult,
  runId: string,
  paths: RunPaths,
  seconds: number,
  say: (text: string) => void,
): void {
  const winner = result.playoff[0]
  const champion = winner.genome
  say('')
  say(
    `playoff: ${result.playoff.length} generation leaders over ` +
      `${result.options.playoffGames} new boards`,
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
      `champion of ${runId}, from the playoff over ${result.options.playoffGames} boards`,
      '',
      ...summary(winner),
      '',
      describeGenome(champion),
      '',
    ].join('\n'),
  )
  say(`\nwrote ${paths.root}/`)
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

  const settled: ResolvedOptions = resumed ?? resolveOptions({
    populationSize: flags.pop,
    generations: flags.gens,
    games: flags.games,
    seed: flags.seed,
    roundCap: flags.cap,
    maxDepth: flags.depth,
    mutationRate: flags.mutation,
    ...(flags.mutationEnd === null ? {} : { finalMutationRate: flags.mutationEnd }),
    annealShape: flags.anneal,
    ...(flags.annealGens === null ? {} : { annealGenerations: flags.annealGens }),
    mutationWeights: flags.mutationWeights,
    attackDealt: flags.attackDealt,
    attackTaken: flags.attackTaken,
    ...(flags.shapingGens === null ? {} : { shapingGenerations: flags.shapingGens }),
    crossoverRate: flags.crossover,
    survivorFraction: flags.survivors,
    tournamentSize: flags.tournament,
    elites: flags.elites,
    playoffGames: flags.playoff,
    opponents: allOpponents(flags.outDir),
  })
  const runId = flags.runId ?? resumedId ?? defaultRunId(settled)
  const paths = runPaths(flags.outDir, runId)

  if (!flags.quiet) {
    if (!from) {
      say(
        `evolving ${settled.populationSize} genomes over ${settled.generations} generations ` +
          `(seed ${settled.seed}, ${settled.games} boards a generation) against ` +
          settled.opponents.map((opponent) => opponent.id).join(', '),
      )
      if (
        settled.attackDealt !== DEFAULTS.attackDealt ||
        settled.attackTaken !== DEFAULTS.attackTaken
      ) {
        say(
          `attacking games shaped: dealt ${settled.attackDealt}, taken ${settled.attackTaken}, ` +
            `back to the plain differential by generation ${settled.shapingGenerations}`,
        )
      }
    }
    say(header(settled))
  }

  // time spent evolving, not waiting at a prompt
  let seconds = 0
  // without a terminal there is no one to ask, so the run stops at --gens
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  let run = settled
  let result: EvolveResult
  for (;;) {
    const current = run
    const started = Date.now()
    result = evolve(
      current,
      {
        onGeneration: (report, state) => {
          if (!flags.quiet) say(line(report, current))
          const last = state.generation === current.generations
          const due =
            flags.checkpointEvery > 0 && state.generation % flags.checkpointEvery === 0
          if (last || due) writeCheckpoint(paths, runId, state, current)
        },
      },
      from,
    )
    seconds += (Date.now() - started) / 1000
    reportRun(result, runId, paths, seconds, say)

    const more = interactive ? await askForMore() : null
    if (more === null) break
    // the same run carried further, as --resume would, from where it stands
    run = { ...current, generations: current.generations + more }
    from = result.state
    say('')
    say(`continuing up to generation ${run.generations}`)
    if (!flags.quiet) say(header(run))
  }
  const winner = result.playoff[0]

  // without a terminal nothing is saved unless it was asked for, so scripted
  // runs do not fill the opponents directory with generated names
  const name = flags.saveAs ?? (interactive ? await askForName(flags.outDir) : null)
  if (name !== null) {
    say(`saved ${saveChampion(flags.outDir, name, runId, winner)}`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
})
