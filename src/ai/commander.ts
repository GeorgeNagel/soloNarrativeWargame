/**
 * What a game asks of an AI: given the board, name every order for one side.
 *
 * Evolved genomes and the hand-written baselines in `baseline.ts` both wear this
 * interface, so a game, a tournament and a benchmark are all the same code.
 */
import type { OrderBook, Side, UnitState } from '../prototypes/tactical/model'
import type { Roster } from './roster'
import type { Objective } from './scenario'

export interface Commander {
  /** Short label for reports. */
  id: string
  /**
   * This side's whole order book for the round. Only this side's living units
   * belong in it, so two commanders' books merge into the one a round takes.
   * `attacker` is the side the scenario's `objective` asks to break the other;
   * ties and stalemates go to the defender.
   */
  orders(
    board: UnitState[],
    side: Side,
    round: number,
    roster: Roster,
    attacker: Side,
    objective: Objective,
  ): OrderBook
}
