/**
 * A genome as text. Shared by both CLIs, and the reason a champion is worth
 * committing: the trees read as tactics, so a run can be reviewed rather than
 * only measured.
 */
import { UNIT_TYPES, orderCode } from '../prototypes/tactical/model'
import type { RoundOrder } from '../prototypes/tactical/model'
import { genomeSize } from './genome'
import type { Genome } from './genome'
import { describeTree } from './tree'

function showOrder(order: RoundOrder): string {
  return `→ ${orderCode(order)}`
}

export function describeGenome(genome: Genome): string {
  const parts = [
    `${genome.id} — ${genomeSize(genome)} nodes, bred in generation ${genome.generation}`,
    '',
    'army posture tree',
    describeTree(genome.army, (posture) => `→ posture ${posture}`, '  '),
  ]
  for (const type of UNIT_TYPES) {
    parts.push('', `${type} tree`, describeTree(genome.units[type], showOrder, '  '))
  }
  return parts.join('\n')
}
