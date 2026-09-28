import { describe, expect, it } from 'vitest'
import { HEX_DIRECTIONS, hex, hexNeighbors } from '../engine'
import type { Hex, HexDirection } from '../engine'
import {
  HITS_TO_ELIMINATE,
  facingAngle,
  isRearAttack,
} from '../prototypes/tactical/model'
import type { Side, UnitState, UnitType } from '../prototypes/tactical/model'
import {
  ARMY_FEATURE_SPECS,
  FAR,
  UNIT_FEATURE_SPECS,
  armyFeatures,
  edgeToward,
  inRearArc,
  strengthOf,
  unitFeatures,
  wheelsBetween,
  wheelsToward,
} from './features'

function unit(
  id: string,
  side: Side,
  type: UnitType,
  pos: Hex,
  facing: HexDirection,
  hits = 0,
): UnitState {
  return {
    id,
    name: id,
    tag: id,
    side,
    type,
    hits,
    pos,
    facing,
    angle: facingAngle(facing),
  }
}

const ROSTER = { player: 1, enemy: 1 }

describe('feature specs', () => {
  it('name every key once, with a usable range', () => {
    for (const specs of [UNIT_FEATURE_SPECS, ARMY_FEATURE_SPECS]) {
      const keys = specs.map((spec) => spec.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const spec of specs) {
        expect(spec.max).toBeGreaterThan(spec.min)
        expect(spec.step).toBeGreaterThan(0)
      }
    }
  })
})

describe('wheelsBetween', () => {
  it('is zero for the edge already faced', () => {
    for (const direction of HEX_DIRECTIONS) {
      expect(wheelsBetween(direction, direction)).toBe(0)
    }
  })

  it('counts one wheel left as negative and one right as positive', () => {
    // HEX_DIRECTIONS runs counter-clockwise, so a left wheel steps forward in it
    expect(wheelsBetween('E', 'NE')).toBe(-1)
    expect(wheelsBetween('NE', 'E')).toBe(1)
  })

  it('never asks for more than three wheels', () => {
    for (const from of HEX_DIRECTIONS) {
      for (const to of HEX_DIRECTIONS) {
        expect(Math.abs(wheelsBetween(from, to))).toBeLessThanOrEqual(3)
      }
    }
  })

  it('takes three either way to come about, and breaks the tie to the left', () => {
    expect(wheelsBetween('E', 'W')).toBe(-3)
  })
})

describe('edgeToward and wheelsToward', () => {
  it('names the edge a neighbour sits across', () => {
    const from = hex(2, 3)
    expect(edgeToward(from, hex(3, 3))).toBe('E')
    expect(edgeToward(from, hex(3, 2))).toBe('NE')
    expect(edgeToward(from, hex(1, 4))).toBe('SW')
  })

  it('has nothing to point at on the hex the unit already holds', () => {
    expect(edgeToward(hex(0, 0), hex(0, 0))).toBeNull()
  })

  it('turns a unit onto its target', () => {
    const scout = unit('a', 'player', 'cavalry', hex(2, 3), 'E')
    expect(wheelsToward(scout, hex(3, 3))).toBe(0)
    expect(wheelsToward(scout, hex(3, 2))).toBe(-1)
    // three either way, and a tie wheels left
    expect(wheelsToward(scout, hex(1, 3))).toBe(-3)
  })
})

describe('inRearArc', () => {
  it('agrees with the combat rule for every adjacent hex and facing', () => {
    const around = hexNeighbors(hex(3, 3))
    for (const facing of HEX_DIRECTIONS) {
      const defender = unit('d', 'enemy', 'infantry', hex(3, 3), facing)
      for (const attackerPos of around) {
        expect(inRearArc(defender, attackerPos)).toBe(
          isRearAttack(defender, attackerPos),
        )
      }
    }
  })

  it('reads a distant hex behind the unit as its rear', () => {
    const defender = unit('d', 'enemy', 'infantry', hex(3, 3), 'E')
    expect(inRearArc(defender, hex(0, 3))).toBe(true)
    expect(inRearArc(defender, hex(6, 3))).toBe(false)
  })
})

describe('strengthOf', () => {
  it('is one for an untouched side and zero for a dead one', () => {
    const board = [
      unit('a', 'player', 'infantry', hex(0, 6), 'NE'),
      unit('b', 'player', 'infantry', hex(1, 6), 'NE'),
      unit('c', 'enemy', 'infantry', hex(4, 0), 'SW', HITS_TO_ELIMINATE),
    ]
    expect(strengthOf(board, 'player', 2)).toBe(1)
    expect(strengthOf(board, 'enemy', 1)).toBe(0)
  })

  it('falls with the hits a side has taken', () => {
    const board = [
      unit('a', 'player', 'infantry', hex(0, 6), 'NE', 5),
      unit('b', 'player', 'infantry', hex(1, 6), 'NE'),
    ]
    expect(strengthOf(board, 'player', 2)).toBeCloseTo((10 / 15 + 1) / 2, 10)
  })

  it('is zero for a side that deployed nothing', () => {
    expect(strengthOf([], 'player', 0)).toBe(0)
  })
})

describe('unitFeatures', () => {
  const foot = unit('a', 'player', 'infantry', hex(2, 4), 'NE')
  const bow = unit('b', 'player', 'archers', hex(1, 4), 'NE')
  const foe = unit('c', 'enemy', 'cavalry', hex(2, 3), 'SW')

  it('reads the nearest enemy off the board', () => {
    const features = unitFeatures(foot, [foot, bow, foe], {
      round: 3,
      posture: 2,
      roster: { player: 2, enemy: 1 },
      attacker: 'player',
    })
    expect(features.foeRange).toBe(1)
    expect(features.adjacentEnemies).toBe(1)
    expect(features.adjacentFriends).toBe(1)
    expect(features.engaged).toBe(1)
    expect(features.friendsAlive).toBe(2)
    expect(features.foesAlive).toBe(1)
    expect(features.round).toBe(3)
    expect(features.posture).toBe(2)
    expect(features.allowance).toBe(2)
    expect(features.canShoot).toBe(0)
  })

  it('carries a value for every key the trees may branch on', () => {
    const features = unitFeatures(bow, [foot, bow, foe], {
      round: 1,
      posture: 0,
      roster: { player: 2, enemy: 1 },
      attacker: 'player',
    })
    for (const spec of UNIT_FEATURE_SPECS) {
      expect(Number.isFinite(features[spec.key])).toBe(true)
    }
  })

  it('counts a shot the archers have lined up', () => {
    const target = unit('c', 'enemy', 'cavalry', hex(3, 1), 'SW')
    const features = unitFeatures(bow, [bow, target], {
      round: 1,
      posture: 0,
      roster: { player: 1, enemy: 1 },
      attacker: 'player',
    })
    expect(features.canShoot).toBe(1)
    expect(features.shootTargets).toBe(1)
    expect(features.shootRange).toBe(3)
  })

  it('flags the attacking side and not the defending one', () => {
    const ctx = { round: 1, posture: 0, roster: { player: 2, enemy: 1 } }
    expect(unitFeatures(foot, [foot, foe], { ...ctx, attacker: 'player' }).attacking).toBe(1)
    expect(unitFeatures(foe, [foot, foe], { ...ctx, attacker: 'player' }).attacking).toBe(0)
    expect(unitFeatures(foot, [foot, foe], { ...ctx, attacker: 'enemy' }).attacking).toBe(0)
  })

  it('gives a lone unit a full strength ratio', () => {
    const features = unitFeatures(foot, [foot, foe], {
      round: 1,
      posture: 0,
      roster: { player: 1, enemy: 1 },
      attacker: 'player',
    })
    expect(features.strengthRatio).toBeCloseTo(0.5, 10)
  })
})

describe('armyFeatures', () => {
  const board = [
    unit('a', 'player', 'infantry', hex(2, 4), 'NE'),
    unit('b', 'player', 'archers', hex(1, 5), 'NE'),
    unit('c', 'enemy', 'cavalry', hex(2, 3), 'SW'),
  ]

  it('counts the armies and how close they are', () => {
    const features = armyFeatures(board, 'player', { round: 2, roster: { player: 2, enemy: 1 }, attacker: 'player' })
    expect(features.friendsAlive).toBe(2)
    expect(features.foesAlive).toBe(1)
    expect(features.contacts).toBe(1)
    expect(features.closestRange).toBe(1)
    expect(features.ownShooters).toBe(1)
    expect(features.foeShooters).toBe(0)
    expect(features.round).toBe(2)
  })

  it('carries a value for every key the army tree may branch on', () => {
    const features = armyFeatures(board, 'enemy', { round: 1, roster: { player: 2, enemy: 1 }, attacker: 'player' })
    for (const spec of ARMY_FEATURE_SPECS) {
      expect(Number.isFinite(features[spec.key])).toBe(true)
    }
  })

  it('flags the attacking side and not the defending one', () => {
    const ctx = { round: 1, roster: { player: 2, enemy: 1 } }
    expect(armyFeatures(board, 'player', { ...ctx, attacker: 'player' }).attacking).toBe(1)
    expect(armyFeatures(board, 'enemy', { ...ctx, attacker: 'player' }).attacking).toBe(0)
  })

  it('does not divide by an army that is gone', () => {
    const features = armyFeatures([], 'player', { round: 1, roster: ROSTER, attacker: 'player' })
    expect(features.meanRange).toBe(FAR)
    expect(features.strengthRatio).toBe(0.5)
  })
})
