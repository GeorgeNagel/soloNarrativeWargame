/**
 * The fixed opponents a run is scored against: the hand-written baselines, plus
 * every champion that has been saved under a name (see `saved-opponents.ts`).
 */
import { BASELINES, baselineById } from './baseline'
import type { Commander } from './commander'
import { commanderOf } from './genome'
import type { Genome } from './genome'

/** A commander a run plays against, and the genome behind it if it has one. */
export interface Opponent {
  id: string
  commander: Commander
  /** Null for a hand-written baseline, which is named rather than stored. */
  genome: Genome | null
}

export function baselineOpponent(commander: Commander): Opponent {
  return { id: commander.id, commander, genome: null }
}

/** A genome playing under a name of its own rather than its genome id. */
export function genomeOpponent(name: string, genome: Genome): Opponent {
  const played = commanderOf(genome)
  return { id: name, commander: { ...played, id: name }, genome }
}

export const BASELINE_OPPONENTS: readonly Opponent[] = BASELINES.map(baselineOpponent)

/**
 * An opponent as a checkpoint stores it: a baseline by name, a genome in full,
 * so a resumed run plays exactly what the run that wrote it played.
 */
export interface OpponentRecord {
  id: string
  genome: Genome | null
}

export function toOpponentRecord(opponent: Opponent): OpponentRecord {
  return { id: opponent.id, genome: opponent.genome }
}

export function fromOpponentRecord(record: OpponentRecord): Opponent {
  if (record.genome) return genomeOpponent(record.id, record.genome)
  const baseline = baselineById(record.id)
  if (!baseline) throw new Error(`checkpoint names an unknown baseline: ${record.id}`)
  return baselineOpponent(baseline)
}
