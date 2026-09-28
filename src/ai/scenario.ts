/**
 * Randomised scenarios for the tournament.
 *
 * Both sides deploy as a point reflection of each other through the board's
 * centre hex — the shape the hand-written St. Aubin Ford scenario already has —
 * with the same number of units. In a mirrored muster they also get the **same**
 * mix of unit types; in an asymmetric one each side's mix is drawn on its own.
 * Rosters and deployment vary from game to game so the evolution cannot memorise
 * one opening, and the tournament plays every scenario from both sides, so a win
 * says something about the AI rather than about the draw.
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

/**
 * What decides a game.
 *
 * - `hold`: the attacker wins only by wiping the defender out; any other ending
 *   goes to the defender.
 * - `deathmatch`: the side that removed more enemy units wins; a tie goes to the
 *   defender.
 */
export type Objective = 'hold' | 'deathmatch'
export const OBJECTIVES: readonly Objective[] = ['hold', 'deathmatch']

/**
 * How the two rosters relate: `mirrored` gives both sides the same mix of types,
 * `asymmetric` draws each side's mix on its own. Either way both sides deploy the
 * same number of units on mirrored hexes.
 */
export type Muster = 'mirrored' | 'asymmetric'
export const MUSTERS: readonly Muster[] = ['mirrored', 'asymmetric']

export interface Scenario {
  /** Seed this scenario was drawn from, so a game can be named and replayed. */
  seed: number
  objective: Objective
  muster: Muster
  /** The side the objective asks to break the other; ties and stalemates go to the defender. */
  attacker: Side
  units: UnitState[]
}

export interface ScenarioOptions {
  seed?: number
  /** Pins the roster size; otherwise it is drawn. */
  size?: number
  /** Pins the objective; otherwise it is drawn. */
  objective?: Objective
  /** Pins the muster; otherwise it is drawn. */
  muster?: Muster
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

function typesOf(size: number, rng: Rng): UnitType[] {
  return Array.from({ length: size }, () => rng.pick(UNIT_TYPES))
}

function sameMix(a: readonly UnitType[], b: readonly UnitType[]): boolean {
  return [...a].sort().join() === [...b].sort().join()
}

/** Redraws before giving up on an asymmetric mix that differs from the player's. */
const ASYMMETRIC_TRIES = 20

/**
 * Draw a scenario: a roster size, a mix of types, a deployment inside the
 * player's rows, which side attacks, the objective and the muster. The enemy
 * deploys on the mirror of the player's hexes, with the same list of types in a
 * mirrored muster and a list of its own in an asymmetric one.
 */
export function randomScenario(
  rng: Rng,
  options: ScenarioOptions = {},
): Scenario {
  const zone = deploymentZone('player')
  const size = Math.min(
    zone.length,
    options.size ?? rng.range(MIN_ROSTER, MAX_ROSTER),
  )
  const types = typesOf(size, rng)
  const hexes = shuffled(zone, rng).slice(0, size)

  // drawn after the roster and deployment, so a mirrored scenario's board is the
  // one its seed gave before objectives and musters existed
  const attacker: Side = rng.next() < 0.5 ? 'player' : 'enemy'
  // always drawn, so pinning one leaves the rest of the stream where it was
  const drawnObjective = rng.pick(OBJECTIVES)
  const drawnMuster = rng.pick(MUSTERS)
  const objective = options.objective ?? drawnObjective
  const muster = options.muster ?? drawnMuster

  let foeTypes = types
  if (muster === 'asymmetric') {
    // every redraw matching the player's mix is vanishingly rare; if it happens,
    // the scenario is mirrored in all but name
    for (let tries = 0; tries < ASYMMETRIC_TRIES && sameMix(foeTypes, types); tries += 1) {
      foeTypes = typesOf(size, rng)
    }
  }

  const units: UnitState[] = []
  for (let index = 0; index < size; index += 1) {
    units.push(unitOf('player', index, types[index], hexes[index], PLAYER_FACING))
  }
  for (let index = 0; index < size; index += 1) {
    units.push(
      unitOf('enemy', index, foeTypes[index], mirrorHex(hexes[index]), ENEMY_FACING),
    )
  }

  return {
    seed: options.seed ?? 0,
    objective,
    muster,
    attacker,
    units,
  }
}

/** A fresh copy of a scenario's board, so a game never mutates the scenario. */
export function deploy(scenario: Scenario): UnitState[] {
  return scenario.units.map((unit) => ({ ...unit, pos: { ...unit.pos } }))
}
