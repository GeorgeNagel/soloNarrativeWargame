/**
 * The genetic algorithm itself.
 *
 * A generation is one gauntlet (see `tournament.ts`) — every genome against every
 * fixed opponent over a fresh set of boards — a ranking, and then the top half
 * reproducing to refill the population. Crossover swaps subtrees between two
 * parents, tree by tree, and mutation nudges thresholds, repoints branches at
 * other features and regrows the occasional subtree.
 *
 * Fitness is absolute: the opponents never change during a run, so a rising
 * score means the population is getting better against them. The boards do
 * change, generation to generation, so a leader has to keep beating new ones to
 * stay on top. Each generation's leader is kept aside, and at the end they all
 * play a playoff on one large set of boards none of them has seen; its winner is
 * the run's champion.
 */
import { UNIT_TYPES } from '../prototypes/tactical/model'
import type { RoundOrder, UnitType } from '../prototypes/tactical/model'
import { DEFAULT_ROUND_CAP } from './game'
import { genomeSize, makeGenomeSpecs, randomGenome } from './genome'
import type { Genome, GenomeSpecs } from './genome'
import { BASELINE_OPPONENTS } from './opponents'
import type { Opponent } from './opponents'
import { makeRng, seedFrom } from './rng'
import type { Rng } from './rng'
import { DEFAULT_MUTATION_WEIGHTS, crossover, mutate } from './tree'
import type { MutationWeights, Tree, TreeSpec } from './tree'
import { runGauntlet } from './tournament'
import type { Benchmark, Standing } from './tournament'

export interface EvolveOptions {
  populationSize?: number
  generations?: number
  /**
   * Boards per generation, shared by every opponent. Each is played from both
   * sides. More boards make a generation's ranking less a matter of which boards
   * were drawn.
   */
  games?: number
  seed?: number
  roundCap?: number
  maxDepth?: number
  /**
   * Per-node chance of mutation when a child is made, in the first bred
   * generation. It anneals toward `finalMutationRate` (see `mutationRateAt`).
   */
  mutationRate?: number
  /** The mutation rate once annealing is done. Defaults to `mutationRate`: no annealing. */
  finalMutationRate?: number
  /**
   * How the rate moves from start to finish: `linear` in equal steps, `geometric`
   * by an equal factor each generation, so it falls fast early and gently late.
   */
  annealShape?: AnnealShape
  /**
   * Generations the rate takes to reach `finalMutationRate`, holding there after.
   * Defaults to the run's length.
   */
  annealGenerations?: number
  /**
   * Relative odds of each kind of change when a node mutates: nudging a
   * threshold, repointing a branch at another feature, nudging or replacing a
   * leaf, or regrowing a subtree.
   */
  mutationWeights?: MutationWeights
  /**
   * Per-tree chance that a child's tree is crossed over from both parents; the
   * rest are copied from the first parent before mutation.
   */
  crossoverRate?: number
  /** Fraction of the ranking that reproduces — the brief's top 50%. */
  survivorFraction?: number
  /**
   * Survivors drawn per parent pick, the best of them winning. 1 picks among the
   * survivors uniformly; higher leans harder on the top of the ranking.
   */
  tournamentSize?: number
  /** Best genomes carried into the next generation untouched. */
  elites?: number
  /** Boards in the final playoff between the generations' leaders. */
  playoffGames?: number
  /** The fixed commanders every genome is scored against. */
  opponents?: readonly Opponent[]
}

export type AnnealShape = 'linear' | 'geometric'
export const ANNEAL_SHAPES: readonly AnnealShape[] = ['linear', 'geometric']

export interface ResolvedOptions extends Required<Omit<EvolveOptions, 'opponents'>> {
  opponents: readonly Opponent[]
}

export const DEFAULTS: ResolvedOptions = {
  populationSize: 24,
  generations: 20,
  games: 12,
  seed: 1,
  roundCap: DEFAULT_ROUND_CAP,
  maxDepth: 6,
  mutationRate: 0.15,
  finalMutationRate: 0.15,
  annealShape: 'geometric',
  annealGenerations: 20,
  mutationWeights: DEFAULT_MUTATION_WEIGHTS,
  crossoverRate: 1,
  survivorFraction: 0.5,
  tournamentSize: 2,
  elites: 2,
  playoffGames: 50,
  opponents: BASELINE_OPPONENTS,
}

/** What is wrong with a set of breeding settings, or null when nothing is. */
export function breedingProblem(options: ResolvedOptions): string | null {
  const { mutationRate, finalMutationRate, annealShape, annealGenerations } = options
  const { crossoverRate, survivorFraction, tournamentSize } = options
  const w = options.mutationWeights
  if (!(mutationRate >= 0 && mutationRate <= 1)) return 'mutation rate must be in [0, 1]'
  if (!(finalMutationRate >= 0 && finalMutationRate <= 1)) {
    return 'final mutation rate must be in [0, 1]'
  }
  if (!ANNEAL_SHAPES.includes(annealShape)) {
    return `anneal shape must be one of ${ANNEAL_SHAPES.join(', ')}`
  }
  if (annealShape === 'geometric' && mutationRate !== finalMutationRate) {
    if (mutationRate === 0 || finalMutationRate === 0) {
      return 'geometric annealing cannot start or end at a rate of 0; use linear'
    }
  }
  if (!(Number.isInteger(annealGenerations) && annealGenerations >= 1)) {
    return 'anneal generations must be a whole number of at least 1'
  }
  if (!(crossoverRate >= 0 && crossoverRate <= 1)) return 'crossover rate must be in [0, 1]'
  if (!(survivorFraction > 0 && survivorFraction <= 1)) {
    return 'survivor fraction must be in (0, 1]'
  }
  if (!(Number.isInteger(tournamentSize) && tournamentSize >= 1)) {
    return 'tournament size must be a whole number of at least 1'
  }
  if (Object.values(w).some((weight) => !(weight >= 0))) {
    return 'mutation weights must be zero or more'
  }
  if (w.threshold + w.feature + w.structure <= 0) {
    return 'mutation weights give a branch nothing to do: raise threshold, feature or structure'
  }
  if (w.nudge + w.replace + w.structure <= 0) {
    return 'mutation weights give a leaf nothing to do: raise nudge, replace or structure'
  }
  return null
}

export function resolveOptions(options: EvolveOptions = {}): ResolvedOptions {
  const merged = { ...DEFAULTS, ...options }
  // both follow the run's own settings rather than the defaults', unless named
  const resolved = {
    ...merged,
    finalMutationRate: options.finalMutationRate ?? merged.mutationRate,
    annealGenerations: options.annealGenerations ?? merged.generations,
  }
  const problem = breedingProblem(resolved)
  if (problem) throw new Error(problem)
  return resolved
}

export interface GenerationReport {
  generation: number
  /** Best, mean and worst mean-score against the opponents. */
  best: number
  mean: number
  worst: number
  bestId: string
  /** Mean rounds a game lasted, across the whole generation. */
  rounds: number
  /** Mean total nodes across a genome's five trees. */
  nodes: number
  /** The per-node mutation rate that bred this generation (see `mutationRateAt`). */
  mutation: number
  /** The leader's results against each opponent, in the options' order. */
  against: Benchmark[]
}

export interface EvolveResult {
  options: ResolvedOptions
  reports: GenerationReport[]
  /** The final generation's ranking. */
  standings: Standing[]
  /** Every generation's leader, ranked on the playoff's boards. */
  playoff: Standing[]
  /** The playoff's winner. */
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
 * The per-node mutation rate that breeds `generation`: `mutationRate` for
 * generation 1, moving to `finalMutationRate` by generation `annealGenerations`
 * and holding there. Generation zero is drawn at random and reports the start.
 */
export function mutationRateAt(
  generation: number,
  options: Pick<
    ResolvedOptions,
    'mutationRate' | 'finalMutationRate' | 'annealShape' | 'annealGenerations'
  >,
): number {
  const { mutationRate: start, finalMutationRate: end, annealGenerations } = options
  const span = annealGenerations - 1
  const progress = span > 0 ? Math.min(1, Math.max(0, (generation - 1) / span)) : 1
  if (start === end) return start
  if (options.annealShape === 'linear') return start + (end - start) * progress
  return start * (end / start) ** progress
}

/** How much a child may differ from its parents. */
export type Variation = Pick<
  ResolvedOptions,
  'mutationRate' | 'mutationWeights' | 'crossoverRate'
>

/** Cross two trees with probability `rate`, otherwise copy the first. */
function maybeCross<L>(
  a: Tree<L>,
  b: Tree<L>,
  spec: TreeSpec<L>,
  rng: Rng,
  rate: number,
): Tree<L> {
  // `mutate` rebuilds every node, so handing back the parent's tree shares nothing
  if (!rng.chance(rate)) return a
  return crossover(a, b, spec, rng)
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
  variation: Variation,
): Genome {
  const { mutationRate, mutationWeights, crossoverRate } = variation
  const units = {} as Record<UnitType, Tree<RoundOrder>>
  for (const type of UNIT_TYPES) {
    const crossed = maybeCross(a.units[type], b.units[type], specs.unit, rng, crossoverRate)
    units[type] = mutate(crossed, specs.unit, rng, mutationRate, mutationWeights)
  }
  const army = mutate(
    maybeCross(a.army, b.army, specs.army, rng, crossoverRate),
    specs.army,
    rng,
    mutationRate,
    mutationWeights,
  )
  return { id, generation, army, units }
}

/** Tournament selection over the survivors: `size` draws, the best rank wins. */
function pickParent(survivors: Standing[], rng: Rng, size: number): Genome {
  let best = rng.int(survivors.length)
  for (let draw = 1; draw < size; draw += 1) {
    best = Math.min(best, rng.int(survivors.length))
  }
  return survivors[best].genome
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

  const variation = { ...options, mutationRate: mutationRateAt(generation, options) }
  let child = 1
  while (population.length < options.populationSize) {
    const size = options.tournamentSize
    const a = pickParent(survivors, rng, size)
    let b = pickParent(survivors, rng, size)
    // one parent asexually is a mutation-only child, which is fine but wasteful
    if (b === a && survivors.length > 1) b = pickParent(survivors, rng, size)
    population.push(breed(a, b, `g${generation}-${child}`, generation, rng, specs, variation))
    child += 1
  }

  return population
}

/**
 * A run, paused between generations: everything needed to carry on, and nothing
 * more. A checkpoint is this state written down (see `checkpoint.ts`), which is
 * why the generator's state travels with it — a resumed run continues the same
 * stream instead of starting a new one.
 */
export interface RunState {
  /** The generation the population has just been ranked in. */
  generation: number
  /** The population, in ranked order. */
  standings: Standing[]
  /** One report per generation so far, oldest first. */
  reports: GenerationReport[]
  /**
   * Every generation's leader so far, oldest first, each genome once — an elite
   * that led several generations running is entered the first time only.
   */
  winners: Genome[]
  /** The generator that breeds the next generation. */
  rng: Rng
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
    mutation: mutationRateAt(generation, options),
    against: leader.against,
  }
}

function withLeader(winners: Genome[], standings: Standing[]): Genome[] {
  const leader = standings[0].genome
  return winners.some((genome) => genome.id === leader.id)
    ? winners
    : [...winners, leader]
}

/**
 * The gauntlet for one generation of a run. The boards are seeded from the run's
 * seed and the generation, so every generation plays a fresh set and every
 * genome within one plays the same set.
 */
function rank(
  population: Genome[],
  generation: number,
  options: ResolvedOptions,
): Standing[] {
  return runGauntlet(
    population,
    options.opponents.map((opponent) => opponent.commander),
    {
      games: options.games,
      seed: seedFrom(options.seed, generation),
      roundCap: options.roundCap,
    },
  )
}

/** Generation zero: a random population, ranked. */
export function startRun(
  options: ResolvedOptions,
  specs: GenomeSpecs = makeGenomeSpecs(options.maxDepth),
): RunState {
  const rng = makeRng(options.seed)
  const standings = rank(initialPopulation(options.populationSize, rng, specs), 0, options)
  return {
    generation: 0,
    standings,
    reports: [report(0, standings, options)],
    winners: withLeader([], standings),
    rng,
  }
}

/**
 * One generation on: breed from the ranking, then rank the children. Returns a
 * new state and leaves the one passed in alone, so a caller can checkpoint the
 * state it holds without racing the next step.
 */
export function stepRun(
  state: RunState,
  options: ResolvedOptions,
  specs: GenomeSpecs = makeGenomeSpecs(options.maxDepth),
): RunState {
  const generation = state.generation + 1
  const population = nextGeneration(
    state.standings,
    generation,
    state.rng,
    options,
    specs,
  )
  const standings = rank(population, generation, options)
  return {
    generation,
    standings,
    reports: [...state.reports, report(generation, standings, options)],
    winners: withLeader(state.winners, standings),
    rng: state.rng,
  }
}

/**
 * Every generation's leader on one set of boards none of them was ranked on.
 * Scores from different generations were earned on different boards and cannot
 * be compared; this is the comparison that can.
 */
export function runPlayoff(winners: Genome[], options: ResolvedOptions): Standing[] {
  return runGauntlet(
    winners,
    options.opponents.map((opponent) => opponent.commander),
    {
      games: options.playoffGames,
      // three parts rather than two, so it can never meet a generation's seed
      seed: seedFrom(options.seed, 0x9a7f, 0),
      roundCap: options.roundCap,
    },
  )
}

export interface EvolveHooks {
  /** Called as each generation is ranked, including generation zero. */
  onGeneration?: (report: GenerationReport, state: RunState) => void
}

/**
 * Run the whole thing, from scratch or from a state a checkpoint was read into,
 * then play the playoff.
 *
 * `hooks.onGeneration` fires as each generation is ranked, which is where a CLI
 * prints the curve and writes its checkpoints.
 */
export function evolve(
  options: EvolveOptions = {},
  hooks: EvolveHooks | ((report: GenerationReport) => void) = {},
  from?: RunState,
): EvolveResult {
  const resolved = resolveOptions(options)
  const specs = makeGenomeSpecs(resolved.maxDepth)
  const onGeneration =
    typeof hooks === 'function' ? (report: GenerationReport) => hooks(report) : hooks.onGeneration

  let state = from ?? startRun(resolved, specs)
  if (!from) onGeneration?.(state.reports[state.reports.length - 1], state)

  while (state.generation < resolved.generations) {
    state = stepRun(state, resolved, specs)
    onGeneration?.(state.reports[state.reports.length - 1], state)
  }

  const playoff = runPlayoff(state.winners, resolved)
  return {
    options: resolved,
    reports: state.reports,
    standings: state.standings,
    playoff,
    champion: playoff[0].genome,
  }
}
