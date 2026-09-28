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
import { crossover, mutate } from './tree'
import type { Tree } from './tree'
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
  /** Per-node chance of mutation when a child is made. */
  mutationRate?: number
  /** Fraction of the ranking that reproduces — the brief's top 50%. */
  survivorFraction?: number
  /** Best genomes carried into the next generation untouched. */
  elites?: number
  /** Boards in the final playoff between the generations' leaders. */
  playoffGames?: number
  /** The fixed commanders every genome is scored against. */
  opponents?: readonly Opponent[]
}

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
  survivorFraction: 0.5,
  elites: 2,
  playoffGames: 50,
  opponents: BASELINE_OPPONENTS,
}

export function resolveOptions(options: EvolveOptions = {}): ResolvedOptions {
  return { ...DEFAULTS, ...options }
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

function report(generation: number, standings: Standing[]): GenerationReport {
  const leader = standings[0]
  return {
    generation,
    best: leader.score,
    mean: mean(standings.map((standing) => standing.score)),
    worst: standings[standings.length - 1].score,
    bestId: leader.genome.id,
    rounds: mean(standings.map((standing) => standing.rounds)),
    nodes: mean(standings.map((standing) => genomeSize(standing.genome))),
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
    reports: [report(0, standings)],
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
    reports: [...state.reports, report(generation, standings)],
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
