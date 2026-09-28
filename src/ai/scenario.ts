/**
 * Randomised scenarios for the tournament.
 *
 * Both sides get the **same** mix of unit types, deployed as a point reflection
 * of each other through the board's centre hex — the shape the hand-written
 * St. Aubin Ford scenario already has. Rosters and deployment vary from game to
 * game so the evolution cannot memorise one opening, but within a game the two
 * armies are identical and their deployments are exact mirrors, so a win says
 * something about the AI rather than about the draw.
 */
import { hex } from '../engine'
import type { Hex, HexDirection } from '../engine'
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  UNIT_PROFILES,
  UNIT_TYPES,
  boardTiles,
  facingAngle,
} from '../prototypes/tactical/model'
import type { Side, UnitState, UnitType } from '../prototypes/tactical/model'
import { isOnBoard } from '../prototypes/tactical/sim'
import type { Rng } from './rng'

/** Fewest and most units a side deploys, per `docs/units.md`. */
export const MIN_ROSTER = 3
export const MAX_ROSTER = 10

/** How many rows deep, from its own edge, a side deploys in. */
export const DEPLOY_ROWS = 2

/** Where the player faces from the bottom of the board, and the enemy's mirror. */
const PLAYER_FACING: HexDirection = 'NE'
const ENEMY_FACING: HexDirection = 'SW'

export interface Scenario {
  /** Seed this scenario was drawn from, so a game can be named and replayed. */
  seed: number
  units: UnitState[]
}

/**
 * What a tile and its mirror add up to: the reflection is `sum - tile`.
 *
 * With an odd number of rows the board turns about its centre hex. With an even
 * number it turns about the midpoint of the two middle rows, which on the offset
 * layout `boardTiles` draws maps every tile onto another tile of the board.
 */
function reflectionSum(): Hex {
  if (BOARD_ROWS % 2 === 0) {
    return hex(BOARD_COLUMNS - 1 - Math.floor((BOARD_ROWS - 1) / 2), BOARD_ROWS - 1)
  }
  const row = Math.floor(BOARD_ROWS / 2)
  const centre = boardTiles().filter((tile) => tile.r === row)[Math.floor(BOARD_COLUMNS / 2)]
  return hex(2 * centre.q, 2 * centre.r)
}

const REFLECTION_SUM = reflectionSum()

/**
 * Point reflection of a tile through the board's centre — an exact 180° turn of
 * the board in hex space, so it preserves every distance between tiles.
 *
 * On an odd-sized board the rectangle is not closed under it: the far corner of
 * the bottom row reflects one hex off the top row. `deploymentZone` drops those
 * hexes rather than distorting the mirror, which is what keeps a side swap a
 * fair rematch. An even-sized board has no such hexes.
 */
export function mirrorHex(tile: Hex): Hex {
  return hex(REFLECTION_SUM.q - tile.q, REFLECTION_SUM.r - tile.r)
}

/**
 * The hexes one side may deploy in: the `DEPLOY_ROWS` rows nearest its own edge,
 * less any hex whose mirror falls off the board.
 */
export function deploymentZone(side: Side): Hex[] {
  const rows = Array.from({ length: DEPLOY_ROWS }, (_, i) =>
    side === 'player' ? BOARD_ROWS - 1 - i : i,
  )
  return boardTiles().filter(
    (tile) => rows.includes(tile.r) && isOnBoard(mirrorHex(tile)),
  )
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1)
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

function unitOf(
  side: Side,
  index: number,
  type: UnitType,
  pos: Hex,
  facing: HexDirection,
): UnitState {
  const profile = UNIT_PROFILES[type]
  const prefix = side === 'player' ? 'plr' : 'enm'
  const number = String(index + 1).padStart(2, '0')
  const house = side === 'player' ? 'Aubin' : 'Brabant'
  return {
    id: `${prefix}-${index + 1}`,
    name: `${house} ${profile.label.toLowerCase()} ${number}`,
    tag: `${profile.code}-${number}`,
    side,
    type,
    hits: 0,
    pos,
    facing,
    angle: facingAngle(facing),
  }
}

/**
 * Draw a scenario: a roster size, a mix of types, and a deployment inside the
 * player's rows. The enemy gets the same list of types, mirrored.
 *
 * `size` pins the roster size when the caller wants one; otherwise it is drawn.
 */
export function randomScenario(
  rng: Rng,
  options: { seed?: number; size?: number } = {},
): Scenario {
  const zone = deploymentZone('player')
  const size = Math.min(
    zone.length,
    options.size ?? rng.range(MIN_ROSTER, MAX_ROSTER),
  )
  const types = Array.from({ length: size }, () => rng.pick(UNIT_TYPES))
  const hexes = shuffled(zone, rng).slice(0, size)

  const units: UnitState[] = []
  for (let index = 0; index < size; index += 1) {
    units.push(unitOf('player', index, types[index], hexes[index], PLAYER_FACING))
  }
  for (let index = 0; index < size; index += 1) {
    units.push(
      unitOf('enemy', index, types[index], mirrorHex(hexes[index]), ENEMY_FACING),
    )
  }

  return { seed: options.seed ?? 0, units }
}

/** A fresh copy of a scenario's board, so a game never mutates the scenario. */
export function deploy(scenario: Scenario): UnitState[] {
  return scenario.units.map((unit) => ({ ...unit, pos: { ...unit.pos } }))
}
