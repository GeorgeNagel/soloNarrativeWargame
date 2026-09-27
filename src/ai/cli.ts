/**
 * `npm run evolve` — run the genetic algorithm and write out the champion.
 *
 * Every knob has a flag and every run is reproducible from `--seed`, so a result
 * can be re-derived from the line that produced it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { UNIT_TYPES } from '../prototypes/tactical/model'
import type { RoundOrder } from '../prototypes/tactical/model'
import { orderCode } from '../prototypes/tactical/model'
import { BASELINES } from './baseline'
import { DEFAULTS, evolve } from './evolve'
import type { GenerationReport } from './evolve'
import { genomeSize } from './genome'
import type { Genome } from './genome'
import { benchmark } from './tournament'
import { describeTree } from './tree'

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
  out: string
  quiet: boolean
}

const USAGE = `Usage: npm run evolve -- [flags]

  --pop N        population size (default ${DEFAULTS.populationSize})
  --gens N       generations to run (default ${DEFAULTS.generations})
  --games N      scenarios per pairing, each played from both sides (default ${DEFAULTS.gamesPerPairing})
  --seed N       seed for the whole run (default ${DEFAULTS.seed})
  --depth N      maximum tree depth (default ${DEFAULTS.maxDepth})
  --mutation P   per-node mutation chance (default ${DEFAULTS.mutationRate})
  --elites N     top genomes carried over untouched (default ${DEFAULTS.elites})
  --cap N        rounds before a game is a draw (default ${DEFAULTS.roundCap})
  --bench N      benchmark scenarios per generation, 0 to skip (default ${DEFAULTS.benchmarkGames})
  --out PATH     where to write the champion (default artifacts/champion.json)
  --quiet        only print the final report
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
    out: 'artifacts/champion.json',
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
      case '--out':
        flags.out = value
        break
      default:
        throw new Error(`unknown flag ${flag}\n\n${USAGE}`)
    }
  }

  return flags
}

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

function showOrder(order: RoundOrder): string {
  return `→ ${orderCode(order)}`
}

function describeGenome(genome: Genome): string {
  const parts = [`army posture tree`, describeTree(genome.army, (p) => `→ posture ${p}`, '  ')]
  for (const type of UNIT_TYPES) {
    parts.push(`\n${type} tree`, describeTree(genome.units[type], showOrder, '  '))
  }
  return parts.join('\n')
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2))
  const write = (text: string) => process.stdout.write(`${text}\n`)

  if (!flags.quiet) {
    write(
      `evolving ${flags.pop} genomes over ${flags.gens} generations ` +
        `(seed ${flags.seed}, ${flags.games} scenarios per pairing)`,
    )
    write(HEADER)
  }

  const started = Date.now()
  const result = evolve(
    {
      populationSize: flags.pop,
      generations: flags.gens,
      gamesPerPairing: flags.games,
      seed: flags.seed,
      roundCap: flags.cap,
      maxDepth: flags.depth,
      mutationRate: flags.mutation,
      elites: flags.elites,
      benchmarkGames: flags.bench,
    },
    (report) => {
      if (!flags.quiet) write(line(report))
    },
  )

  const seconds = (Date.now() - started) / 1000
  const champion = result.champion
  write('')
  write(`champion ${champion.id} — ${genomeSize(champion)} nodes, ${num(seconds, 1)}s`)
  for (const opponent of BASELINES) {
    const scored = benchmark(champion, opponent, {
      games: Math.max(20, flags.bench),
      seed: flags.seed + 1000,
      roundCap: flags.cap,
    })
    write(
      `  vs ${pad(opponent.id, 18)} ${scored.wins}W ${scored.draws}D ${scored.losses}L ` +
        `— win rate ${num(scored.winRate)}, differential ${num(scored.differential)}`,
    )
  }
  write('')
  write(describeGenome(champion))

  const payload = {
    seed: flags.seed,
    options: {
      ...result.options,
      baselines: result.options.baselines.map((opponent) => opponent.id),
    },
    reports: result.reports,
    champion,
    standings: result.standings.map((standing) => ({
      id: standing.genome.id,
      score: standing.score,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      differential: standing.differential,
    })),
  }
  mkdirSync(dirname(flags.out), { recursive: true })
  writeFileSync(flags.out, `${JSON.stringify(payload, null, 2)}\n`)
  write(`\nwrote ${flags.out}`)
}

main()
