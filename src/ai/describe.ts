/**
 * A genome as text. Shared by both CLIs, and the reason a champion is worth
 * committing: the trees read as tactics, so a run can be reviewed rather than
 * only measured.
 *
 * What is printed is the *reachable* genome. Crossover leaves behind branches
 * that a test further up has already decided, and printing those describes
 * tactics the genome can never perform — so they are folded away first, and
 * the header says how many nodes that removed.
 */
import { HEX_DIRECTIONS } from '../engine'
import { UNIT_TYPES, orderCode } from '../prototypes/tactical/model'
import type { RoundOrder } from '../prototypes/tactical/model'
import { genomeDeadNodes, genomeSize } from './genome'
import type { Genome } from './genome'
import { describeTree, simplifyTree } from './tree'

/**
 * Turns either side of the advance, reduced to the one wheel they amount to.
 *
 * Only the facing a unit ends on matters — shooting and melee are both judged
 * after all the movement — so `R60×3` before and `R60×3` after come to a full
 * circle and change nothing. Saying so keeps a no-op from reading as manoeuvre.
 */
export function netWheels(order: RoundOrder): number {
  const count = HEX_DIRECTIONS.length
  const net = (((order.before + order.after) % count) + count) % count
  return net > count / 2 ? net - count : net
}

/** What an order actually comes to, in words. */
export function orderEffect(order: RoundOrder): string {
  const wheels = netWheels(order)
  const parts: string[] = []
  if (order.advance > 0) {
    parts.push(`${order.advance} hex${order.advance === 1 ? '' : 'es'}`)
  }
  if (wheels !== 0) {
    parts.push(`${Math.abs(wheels)} wheel${Math.abs(wheels) === 1 ? '' : 's'} ${wheels < 0 ? 'left' : 'right'}`)
  }
  if (parts.length === 0) return 'stands, facing unchanged'
  return parts.join(', ')
}

function showOrder(order: RoundOrder): string {
  return `→ ${orderCode(order)}   (${orderEffect(order)})`
}

export function describeGenome(genome: Genome): string {
  const size = genomeSize(genome)
  const dead = genomeDeadNodes(genome)
  const head =
    dead > 0
      ? `${genome.id} — ${size - dead} reachable nodes of ${size}, bred in generation ${genome.generation}`
      : `${genome.id} — ${size} nodes, bred in generation ${genome.generation}`

  const parts = [
    head,
    '',
    'army posture tree',
    describeTree(simplifyTree(genome.army), (posture) => `→ posture ${posture}`, '  '),
  ]
  for (const type of UNIT_TYPES) {
    parts.push(
      '',
      `${type} tree`,
      describeTree(simplifyTree(genome.units[type]), showOrder, '  '),
    )
  }
  return parts.join('\n')
}
