/**
 * The genetic algorithm itself.
 *
 * A generation is one round robin (see `tournament.ts`), a ranking, and then the
 * top half reproducing to refill the population. Crossover swaps subtrees between
 * two parents, tree by tree, and mutation nudges thresholds, repoints branches at
 * other features and regrows the occasional subtree.
 *
 * Fitness here is relative: a genome is only ever scored against its own
 * generation, so the mean score barely moves even while the population improves.
 * The per-generation benchmark against a fixed commander is the absolute curve.
 */
import { UNIT_TYPES } from '../prototypes/tactical/model'
import type { RoundOrder, UnitType } from '../prototypes/tactical/model'
import { BASELINES } from './baseline'
import type { Commander } from './commander'
import { DEFAULT_ROUND_CAP } from './game'
import { genomeSize, makeGenomeSpecs, randomGenome } from './genome'
import type { Genome, GenomeSpecs } from './genome'
import { makeRng, seedFrom } from './rng'
import type { Rng } from './rng'
import { crossover, mutate } from './tree'
import type { Tree } from './tree'
import { benchmark, runTournament } from './tournament'
import type { Benchmark, Standing } from './tournament'

export interface EvolveOptions {
  populationSize?: number
  generations?: number
  /** Scenarios per pairing; each is played from both sides. */
  gamesPerPairing?: number
  seed?: number
  roundCap?: number
  maxDepth?: number
  /** Per-node chance of mutation when a child is made. */
  mutationRate?: number
  /** Fraction of the ranking that reproduces — the brief's top 50%. */
  survivorFraction?: number
  /** Best genomes carried into the next generation untouched. */
  elites?: number
  /** Scenarios per generation against each yardstick. Zero skips the benchmark. */
  benchmarkGames?: number
  /** The fixed commanders the benchmark plays. */
  baselines?: readonly Commander[]
}

export interface ResolvedOptions extends Required<Omit<EvolveOptions, 'baselines'>> {
  baselines: readonly Commander[]
}

export const DEFAULTS: ResolvedOptions = {
  populationSize: 24,
  generations: 20,
  gamesPerPairing: 2,
  seed: 1,
  roundCap: DEFAULT_ROUND_CAP,
  maxDepth: 6,
  mutationRate: 0.15,
  survivorFraction: 0.5,
  elites: 2,
  benchmarkGames: 12,
  baselines: BASELINES,
}

export function resolveOptions(options: EvolveOptions = {}): ResolvedOptions {
  return { ...DEFAULTS, ...options }
}

export interface GenerationReport {
  generation: number
  /** Best, mean and worst mean-score in the round robin. */
  best: number
  mean: number
  worst: number
  bestId: string
  /** Mean rounds a game lasted, across the whole round robin. */
  rounds: number
  /** Mean total nodes across a genome's five trees. */
  nodes: number
  /** Mean player-side advantage in the self-play games. */
  sideBias: number
  /** The leader against each fixed yardstick. Empty when the benchmark is off. */
  benchmarks: Benchmark[]
}

export interface EvolveResult {
  options: ResolvedOptions
  reports: GenerationReport[]
  /** The final generation's ranking. */
  standings: Standing[]
  /** The final generation's leader. */
  champion: Genome
}

// ── population ────────────────────────────────────────────

export function initialPopulation(
  size: number,
  rng: Rng,
  specs: GenomeSpecs,
): Genome[] {
  return Array.from({ length: size }, (_, index) =>
    randomGenome(`g0-${index + 1}`, rng, 0, specs),
  )
}

/**
 * One child from two parents: each of the five trees is crossed over on its own,
 * then mutated. Crossing tree by tree keeps a good cavalry tree intact while the
 * infantry tree is recombined.
 */
export function breed(
  a: Genome,
  b: Genome,
  id: string,
  generation: number,
  rng: Rng,
  specs: GenomeSpecs,
  mutationRate: number,
): Genome {
  const units = {} as Record<UnitType, Tree<RoundOrder>>
  for (const type of UNIT_TYPES) {
    const crossed = crossover(a.units[type], b.units[type], specs.unit, rng)
    units[type] = mutate(crossed, specs.unit, rng, mutationRate)
  }
  const army = mutate(
    crossover(a.army, b.army, specs.army, rng),
    specs.army,
    rng,
    mutationRate,
  )
  return { id, generation, army, units }
}

/** Binary tournament over the survivors: two draws, the better rank wins. */
function pickParent(survivors: Standing[], rng: Rng): Genome {
  const a = rng.int(survivors.length)
  const b = rng.int(survivors.length)
  return survivors[Math.min(a, b)].genome
}

/**
 * The next generation: the elites unchanged, then children of the top
 * `survivorFraction` of the ranking until the population is full again.
 */
export function nextGeneration(
  standings: Standing[],
  generation: number,
  rng: Rng,
  options: ResolvedOptions,
  specs: GenomeSpecs,
): Genome[] {
  const keep = Math.max(
    2,
    Math.round(standings.length * options.survivorFraction),
  )
  const survivors = standings.slice(0, keep)
  const elites = Math.min(options.elites, survivors.length)

  const population: Genome[] = survivors
    .slice(0, elites)
    .map((standing) => standing.genome)

  let child = 1
  while (population.length < options.populationSize) {
    const a = pickParent(survivors, rng)
    let b = pickParent(survivors, rng)
    // one parent asexually is a mutation-only child, which is fine but wasteful
    if (b === a && survivors.length > 1) b = pickParent(survivors, rng)
    population.push(
      breed(
        a,
        b,
        `g${generation}-${child}`,
        generation,
        rng,
        specs,
        options.mutationRate,
      ),
    )
    child += 1
  }

  return population
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function report(
  generation: number,
  standings: Standing[],
  options: ResolvedOptions,
): GenerationReport {
  const leader = standings[0]
  return {
    generation,
    best: leader.score,
    mean: mean(standings.map((standing) => standing.score)),
    worst: standings[standings.length - 1].score,
    bestId: leader.genome.id,
    rounds: mean(standings.map((standing) => standing.rounds)),
    nodes: mean(standings.map((standing) => genomeSize(standing.genome))),
    sideBias: mean(standings.map((standing) => standing.selfSideBias)),
    benchmarks:
      options.benchmarkGames > 0
        ? options.baselines.map((opponent) =>
            benchmark(leader.genome, opponent, {
              games: options.benchmarkGames,
              // one fixed set of scenarios for every generation, so the curve is
              // comparable; the benchmark never feeds back into selection, so
              // there is nothing for the population to overfit to
              seed: seedFrom(options.seed, 0xbe11),
              roundCap: options.roundCap,
            }),
          )
        : [],
  }
}

/**
 * Run the whole thing. `onGeneration` is called as each generation is ranked, so
 * a CLI can print the curve while it runs.
 */
export function evolve(
  options: EvolveOptions = {},
  onGeneration?: (report: GenerationReport) => void,
): EvolveResult {
  const resolved = resolveOptions(options)
  const specs = makeGenomeSpecs(resolved.maxDepth)
  const rng = makeRng(resolved.seed)

  let population = initialPopulation(resolved.populationSize, rng, specs)
  let standings = runTournament(population, {
    gamesPerPairing: resolved.gamesPerPairing,
    seed: seedFrom(resolved.seed, 0),
    roundCap: resolved.roundCap,
  })
  const reports: GenerationReport[] = [report(0, standings, resolved)]
  onGeneration?.(reports[0])

  for (let generation = 1; generation <= resolved.generations; generation += 1) {
    population = nextGeneration(standings, generation, rng, resolved, specs)
    standings = runTournament(population, {
      gamesPerPairing: resolved.gamesPerPairing,
      seed: seedFrom(resolved.seed, generation),
      roundCap: resolved.roundCap,
    })
    const generationReport = report(generation, standings, resolved)
    reports.push(generationReport)
    onGeneration?.(generationReport)
  }

  return { options: resolved, reports, standings, champion: standings[0].genome }
}
