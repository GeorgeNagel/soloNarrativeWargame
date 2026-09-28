import { describe, expect, it } from 'vitest'
import { hexDistance } from '../engine'
import { BOARD_ROWS, UNIT_TYPES, boardTiles } from '../prototypes/tactical/model'
import type { UnitState } from '../prototypes/tactical/model'
import { isOnBoard } from '../prototypes/tactical/sim'
import { makeRng } from './rng'
import {
  DEPLOY_ROWS,
  MAX_ROSTER,
  MIN_ROSTER,
  MUSTERS,
  OBJECTIVES,
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

  it('maps the whole board onto itself', () => {
    for (const tile of boardTiles()) expect(isOnBoard(mirrorHex(tile))).toBe(true)
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

  const mixOf = (units: UnitState[], side: string) =>
    units.filter((unit) => unit.side === side).map((unit) => unit.type).sort()

  it('gives both sides the same mix of types in a mirrored muster', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { units } = randomScenario(makeRng(seed), { muster: 'mirrored' })
      expect(mixOf(units, 'player')).toEqual(mixOf(units, 'enemy'))
    }
  })

  it('gives each side a mix of its own, the same size, in an asymmetric muster', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { units } = randomScenario(makeRng(seed), { muster: 'asymmetric' })
      const player = mixOf(units, 'player')
      const enemy = mixOf(units, 'enemy')
      expect(enemy.length).toBe(player.length)
      expect(enemy).not.toEqual(player)
    }
  })

  it('mirrors the deployment unit for unit', () => {
    for (const muster of ['mirrored', 'asymmetric'] as const) {
      const { units } = randomScenario(makeRng(11), { muster })
      const half = units.length / 2
      for (let index = 0; index < half; index += 1) {
        expect(units[half + index].pos).toEqual(mirrorHex(units[index].pos))
        if (muster === 'mirrored') {
          expect(units[half + index].type).toBe(units[index].type)
        }
      }
    }
  })

  it('draws every objective and every muster', () => {
    const drawn = Array.from({ length: 40 }, (_, seed) => randomScenario(makeRng(seed)))
    expect(new Set(drawn.map((scenario) => scenario.objective))).toEqual(
      new Set(OBJECTIVES),
    )
    expect(new Set(drawn.map((scenario) => scenario.muster))).toEqual(new Set(MUSTERS))
  })

  it('honours a pinned objective and muster without moving the board', () => {
    const free = randomScenario(makeRng(9), { muster: 'mirrored' })
    const pinned = randomScenario(makeRng(9), { objective: 'deathmatch', muster: 'mirrored' })
    expect(pinned.objective).toBe('deathmatch')
    expect(pinned.muster).toBe('mirrored')
    expect(pinned.units).toEqual(free.units)
    expect(pinned.attacker).toBe(free.attacker)
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

  it('draws either side as the attacker', () => {
    const attackers = new Set(
      Array.from({ length: 40 }, (_, seed) => randomScenario(makeRng(seed)).attacker),
    )
    expect(attackers).toEqual(new Set(['player', 'enemy']))
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
