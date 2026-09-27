/**
 * Hand-written commanders, as a yardstick the evolution can be measured against.
 *
 * Tournament fitness is relative — every genome is scored against its own
 * generation, so a rising mean score says nothing on its own. Playing the
 * population against a fixed opponent each generation is what turns that into an
 * absolute curve.
 */
import { hexDistance } from '../engine'
import { HOLD, isAlive, movementOf } from '../prototypes/tactical/model'
import type { OrderBook, Side, UnitState } from '../prototypes/tactical/model'
import type { Commander } from './commander'
import { wheelsToward } from './features'
import { legalOrder } from './genome'
import { roundOrder } from '../prototypes/tactical/model'

function nearestFoe(unit: UnitState, board: UnitState[]): UnitState | null {
  let best: UnitState | null = null
  let bestRange = Infinity
  for (const other of board) {
    if (other.side === unit.side || !isAlive(other)) continue
    const range = hexDistance(unit.pos, other.pos)
    if (range < bestRange) {
      best = other
      bestRange = range
    }
  }
  return best
}

function bookFor(
  board: UnitState[],
  side: Side,
  order: (unit: UnitState) => OrderBook[string],
): OrderBook {
  const orders: OrderBook = {}
  for (const unit of board) {
    if (unit.side !== side || !isAlive(unit)) continue
    orders[unit.id] = order(unit)
  }
  return orders
}

/** The console's current enemy: stand fast and let the other side come. */
export const holdFast: Commander = {
  id: 'hold-fast',
  orders: (board, side) => bookFor(board, side, () => HOLD),
}

/**
 * The MVP opponent in `docs/ai-opponent.md`: wheel onto the nearest enemy and
 * close the distance; once adjacent, stand and fight, turning to face it.
 */
export const closeOnNearest: Commander = {
  id: 'close-on-nearest',
  orders: (board, side) =>
    bookFor(board, side, (unit) => {
      const foe = nearestFoe(unit, board)
      if (!foe) return HOLD
      const wheels = wheelsToward(unit, foe.pos)
      const range = hexDistance(unit.pos, foe.pos)
      const advance = range <= 1 ? 0 : Math.min(movementOf(unit), range - 1)
      return legalOrder(roundOrder(wheels, advance, 0), unit)
    }),
}

/**
 * The yardsticks, in the order reports print them.
 *
 * `holdFast` is much the stronger of the two: advancing forfeits the round's
 * shooting, and a unit that walks across the board to make contact has been shot
 * at all the way in and often arrives with a flank open. The MVP charge in
 * `docs/ai-opponent.md` loses badly to a line that simply stands and shoots.
 */
export const BASELINES: readonly Commander[] = [closeOnNearest, holdFast]
