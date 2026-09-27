/** How many units each side deployed — what the strength features divide by. */
import type { Side, UnitState } from '../prototypes/tactical/model'

export type Roster = Record<Side, number>

export function rosterOf(units: UnitState[]): Roster {
  return {
    player: units.filter((unit) => unit.side === 'player').length,
    enemy: units.filter((unit) => unit.side === 'enemy').length,
  }
}
