import { describe, expect, it } from 'vitest'
import { hexDistance } from '../engine'
import { BOARD_ROWS, UNIT_TYPES } from '../prototypes/tactical/model'
import { isOnBoard } from '../prototypes/tactical/sim'
import { makeRng } from './rng'
import {
  DEPLOY_ROWS,
  MAX_ROSTER,
  MIN_ROSTER,
  centreHex,
  deploy,
  deploymentZone,
  mirrorHex,
  randomScenario,
} from './scenario'

const zone = deploymentZone('player')

describe('mirrorHex', () => {
  it('is its own inverse', () => {
    for (const tile of zone) expect(mirrorHex(mirrorHex(tile))).toEqual(tile)
  })

  it('leaves the centre hex where it is', () => {
    expect(mirrorHex(centreHex())).toEqual(centreHex())
  })

  it('preserves every distance, so a side swap is a fair rematch', () => {
    for (const a of zone) {
      for (const b of zone) {
        expect(hexDistance(mirrorHex(a), mirrorHex(b))).toBe(hexDistance(a, b))
      }
    }
  })
})

describe('deploymentZone', () => {
  it("sits in the rows nearest a side's own edge", () => {
    for (const tile of deploymentZone('player')) {
      expect(tile.r).toBeGreaterThanOrEqual(BOARD_ROWS - DEPLOY_ROWS)
    }
    for (const tile of deploymentZone('enemy')) {
      expect(tile.r).toBeLessThan(DEPLOY_ROWS)
    }
  })

  it('only offers hexes whose mirror is also on the board', () => {
    for (const tile of zone) {
      expect(isOnBoard(tile)).toBe(true)
      expect(isOnBoard(mirrorHex(tile))).toBe(true)
    }
  })

  it("is the mirror of the other side's zone", () => {
    const mirrored = zone.map(mirrorHex).map((tile) => `${tile.q},${tile.r}`).sort()
    const enemy = deploymentZone('enemy').map((tile) => `${tile.q},${tile.r}`).sort()
    expect(mirrored).toEqual(enemy)
  })

  it('has room for the largest roster', () => {
    expect(zone.length).toBeGreaterThanOrEqual(MAX_ROSTER)
  })
})

describe('randomScenario', () => {
  it('replays from its seed', () => {
    expect(randomScenario(makeRng(5))).toEqual(randomScenario(makeRng(5)))
  })

  it('gives both sides the same mix of types', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { units } = randomScenario(makeRng(seed))
      const types = (side: string) =>
        units.filter((unit) => unit.side === side).map((unit) => unit.type).sort()
      expect(types('player')).toEqual(types('enemy'))
    }
  })

  it('mirrors the deployment unit for unit', () => {
    const { units } = randomScenario(makeRng(11))
    const half = units.length / 2
    for (let index = 0; index < half; index += 1) {
      expect(units[half + index].pos).toEqual(mirrorHex(units[index].pos))
      expect(units[half + index].type).toBe(units[index].type)
    }
  })

  it('deploys a legal roster on legal, unshared hexes', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { units } = randomScenario(makeRng(seed))
      const perSide = units.length / 2
      expect(perSide).toBeGreaterThanOrEqual(MIN_ROSTER)
      expect(perSide).toBeLessThanOrEqual(MAX_ROSTER)
      expect(new Set(units.map((unit) => unit.id)).size).toBe(units.length)
      expect(new Set(units.map((unit) => `${unit.pos.q},${unit.pos.r}`)).size).toBe(
        units.length,
      )
      for (const unit of units) {
        expect(isOnBoard(unit.pos)).toBe(true)
        expect(unit.hits).toBe(0)
        expect(UNIT_TYPES).toContain(unit.type)
      }
    }
  })

  it('points each side at the other', () => {
    const { units } = randomScenario(makeRng(3))
    for (const unit of units) {
      expect(unit.facing).toBe(unit.side === 'player' ? 'NE' : 'SW')
    }
  })

  it('honours a pinned roster size', () => {
    const { units } = randomScenario(makeRng(1), { size: 4 })
    expect(units.length).toBe(8)
  })

  it('never asks for more units than the zone holds', () => {
    const { units } = randomScenario(makeRng(1), { size: 99 })
    expect(units.length).toBe(zone.length * 2)
  })
})

describe('deploy', () => {
  it('hands out a copy, so a game cannot spoil the scenario', () => {
    const scenario = randomScenario(makeRng(2))
    const board = deploy(scenario)
    board[0].hits = 9
    board[0].pos = { q: 0, r: 0 }
    expect(scenario.units[0].hits).toBe(0)
    expect(scenario.units[0].pos).not.toEqual({ q: 0, r: 0 })
  })
})
