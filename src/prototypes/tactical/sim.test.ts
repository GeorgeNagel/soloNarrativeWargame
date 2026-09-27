import { describe, expect, it } from 'vitest'

import { hex } from '../../engine'
import type { HexDirection } from '../../engine'
import {
  HITS_TO_ELIMINATE,
  TICKS_PER_ROUND,
  facingAngle,
  isRearAttack,
  orderCode,
  tickOrder,
} from './model'
import type { OrderSlots, UnitState, UnitType } from './model'
import {
  assessBlow,
  engagementsAmong,
  previewAll,
  resolveRound,
  survivors,
} from './sim'

/** A unit built for one assertion: only the fields the rules read. */
function unit(
  id: string,
  type: UnitType,
  side: UnitState['side'],
  q: number,
  r: number,
  facing: HexDirection = 'NE',
): UnitState {
  return {
    id,
    name: id,
    tag: id,
    side,
    type,
    hits: 0,
    pos: hex(q, r),
    facing,
    angle: facingAngle(facing),
  }
}

/** Deals the given d6 results in order, then repeats the last one. */
function scripted(...results: number[]) {
  let i = 0
  return () => results[Math.min(i++, results.length - 1)]
}

function queue(...orders: OrderSlots): OrderSlots {
  return orders
}

describe('assessBlow', () => {
  const target = unit('t', 'cavalry', 'enemy', 1, 0, 'SW')

  it('adds the infantry modifier to the die', () => {
    const blow = assessBlow(unit('a', 'infantry', 'player', 0, 0), target, 3)
    expect(blow.mandated).toBe(5)
    expect(blow.hits).toBe(5)
  })

  it('leaves cavalry and archers unmodified', () => {
    expect(assessBlow(unit('a', 'cavalry', 'player', 0, 0), target, 4).mandated).toBe(4)
    expect(assessBlow(unit('a', 'archers', 'player', 0, 0), target, 4).mandated).toBe(4)
  })

  it('subtracts 2 for skirmishers', () => {
    expect(assessBlow(unit('a', 'skirmishers', 'player', 0, 0), target, 5).mandated).toBe(3)
  })

  it('never mandates fewer than zero hits', () => {
    expect(assessBlow(unit('a', 'skirmishers', 'player', 0, 0), target, 1).mandated).toBe(0)
  })

  it('halves hits against armoured infantry, rounding to the attacker', () => {
    const armoured = unit('t', 'infantry', 'enemy', 1, 0, 'SW')
    // 5 mandated, halved to 2.5, rounded up in the attacker's favour
    const blow = assessBlow(unit('a', 'cavalry', 'player', 0, 0), armoured, 5)
    expect(blow.armoured).toBe(true)
    expect(blow.hits).toBe(3)
  })

  it('doubles hits landed on the rear arc', () => {
    // target faces SW, attacker sits to its west — inside the rear arc
    const behind = unit('a', 'cavalry', 'player', 0, 0)
    const facingAway = unit('t', 'cavalry', 'enemy', 1, 0, 'E')
    const blow = assessBlow(behind, facingAway, 4)
    expect(blow.rear).toBe(true)
    expect(blow.hits).toBe(8)
  })

  it('halves for armour before doubling for the rear', () => {
    const facingAway = unit('t', 'infantry', 'enemy', 1, 0, 'E')
    // 5 mandated -> ceil(2.5) = 3 for armour -> 6 for the rear attack
    const blow = assessBlow(unit('a', 'cavalry', 'player', 0, 0), facingAway, 5)
    expect(blow.hits).toBe(6)
  })
})

describe('front and rear arcs', () => {
  const defender = unit('d', 'infantry', 'enemy', 0, 0, 'E')

  it('treats the faced edge and its two neighbours as front', () => {
    expect(isRearAttack(defender, hex(1, 0))).toBe(false) // E, faced
    expect(isRearAttack(defender, hex(1, -1))).toBe(false) // NE
    expect(isRearAttack(defender, hex(0, 1))).toBe(false) // SE
  })

  it('treats the other three edges as rear', () => {
    expect(isRearAttack(defender, hex(-1, 0))).toBe(true) // W
    expect(isRearAttack(defender, hex(0, -1))).toBe(true) // NW
    expect(isRearAttack(defender, hex(-1, 1))).toBe(true) // SW
  })
})

describe('engagementsAmong', () => {
  it('fights one engagement per contacted face, not one per attacker', () => {
    const a = unit('a', 'cavalry', 'player', 0, 0)
    const b = unit('b', 'cavalry', 'enemy', 1, 0)
    const fights = engagementsAmong([a, b], scripted(3))
    expect(fights).toHaveLength(1)
    expect(fights[0].aId).toBe('a')
    expect(fights[0].bId).toBe('b')
  })

  it('gives a unit surrounded on two faces two engagements', () => {
    const middle = unit('m', 'cavalry', 'player', 0, 0)
    const left = unit('l', 'cavalry', 'enemy', -1, 0)
    const right = unit('r', 'cavalry', 'enemy', 1, 0)
    expect(engagementsAmong([middle, left, right], scripted(3))).toHaveLength(2)
  })

  it('ignores units that are not adjacent, and friends that are', () => {
    const a = unit('a', 'cavalry', 'player', 0, 0)
    const far = unit('f', 'cavalry', 'enemy', 3, 0)
    const friend = unit('p', 'cavalry', 'player', 1, 0)
    expect(engagementsAmong([a, far, friend], scripted(3))).toHaveLength(0)
  })

  it('resolves both sides of an engagement simultaneously', () => {
    const a = unit('a', 'cavalry', 'player', 0, 0)
    const b = unit('b', 'cavalry', 'enemy', 1, 0)
    const [fight] = engagementsAmong([a, b], scripted(6, 2))
    expect(fight.a.roll).toBe(6)
    expect(fight.b.roll).toBe(2)
    expect(fight.a.hits).toBeGreaterThan(0)
    expect(fight.b.hits).toBeGreaterThan(0)
  })

  it('leaves eliminated units out of the fighting', () => {
    const a = { ...unit('a', 'cavalry', 'player', 0, 0), hits: HITS_TO_ELIMINATE }
    const b = unit('b', 'cavalry', 'enemy', 1, 0)
    expect(engagementsAmong([a, b], scripted(3))).toHaveLength(0)
  })
})

describe('movement', () => {
  const hold = tickOrder(null, 0)

  it('advances into the faced hex and spends the allowance', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const steps = previewAll([mover], {
      m: queue(tickOrder(null, 1), tickOrder(null, 1), hold),
    })
    expect(steps.m[0].pos).toEqual(hex(1, 3))
    expect(steps.m[1].pos).toEqual(hex(2, 3))
    expect(steps.m[2].pos).toEqual(hex(2, 3))
  })

  it('wheels for free, so a turn and an advance share one tick', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const steps = previewAll([mover], {
      m: queue(tickOrder('left', 1), hold, hold),
    })
    expect(steps.m[0].facing).toBe('NE')
    expect(steps.m[0].pos).toEqual(hex(1, 2))
  })

  it('lets cavalry spend four hexes across three ticks', () => {
    const horse = unit('h', 'cavalry', 'player', -1, 3, 'E')
    const steps = previewAll([horse], {
      h: queue(tickOrder(null, 2), tickOrder(null, 1), tickOrder(null, 1)),
    })
    expect(steps.h[2].pos).toEqual(hex(3, 3))
  })

  it('caps advances at the unit type allowance', () => {
    // infantry may move 2 hexes, so the third advance is refused
    const foot = unit('f', 'infantry', 'player', 0, 3, 'E')
    const steps = previewAll([foot], {
      f: queue(tickOrder(null, 1), tickOrder(null, 1), tickOrder(null, 1)),
    })
    expect(steps.f[2].pos).toEqual(hex(2, 3))
  })

  it('refuses an advance into an occupied hex and marks it blocked', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const wall = unit('w', 'infantry', 'player', 1, 3, 'E')
    const steps = previewAll([mover, wall], {
      m: queue(tickOrder(null, 1), hold, hold),
      w: queue(hold, hold, hold),
    })
    expect(steps.m[0].pos).toEqual(hex(0, 3))
    expect(steps.m[0].blocked).toBe(true)
  })

  it('refuses an advance off the edge of the board', () => {
    const edge = unit('e', 'cavalry', 'player', 3, 0, 'NE')
    const steps = previewAll([edge], { e: queue(tickOrder(null, 1), hold, hold) })
    expect(steps.e[0].blocked).toBe(true)
  })
})

describe('resolveRound', () => {
  const hold = tickOrder(null, 0)
  const standFast = queue(hold, hold, hold)

  it('returns one frame per tick', () => {
    const frames = resolveRound(
      [unit('a', 'cavalry', 'player', 0, 3), unit('b', 'cavalry', 'enemy', 4, 3)],
      { a: standFast, b: standFast },
      scripted(3),
    )
    expect(frames).toHaveLength(TICKS_PER_ROUND)
  })

  it('accumulates hits across the ticks of a round', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    const frames = resolveRound([a, b], { a: standFast, b: standFast }, scripted(3))
    // adjacent from the start: 3 hits a tick, both ways, three ticks
    expect(frames[0].units.find((u) => u.id === 'b')?.hits).toBe(3)
    expect(frames[2].units.find((u) => u.id === 'b')?.hits).toBe(9)
  })

  it('eliminates a unit at 15 hits and stops it fighting on', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    // infantry rolling 6 lands 8 hits a tick: 8, then 16 -> capped and gone
    const frames = resolveRound([a, b], { a: standFast, b: standFast }, scripted(6))
    expect(frames[1].eliminatedIds).toContain('b')
    expect(frames[1].units.find((u) => u.id === 'b')?.hits).toBe(HITS_TO_ELIMINATE)
    expect(frames[2].engagements).toHaveLength(0)
    expect(survivors(frames).map((u) => u.id)).toEqual(['a'])
  })

  it('carries hits taken in an earlier round into the next one', () => {
    const wounded = { ...unit('a', 'cavalry', 'player', 0, 3, 'E'), hits: 10 }
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    const frames = resolveRound([wounded, b], { a: standFast, b: standFast }, scripted(3))
    expect(frames[0].units.find((u) => u.id === 'a')?.hits).toBe(13)
  })

  it('lets a unit eliminated this tick land its own blow first', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const b = { ...unit('b', 'cavalry', 'enemy', 1, 3, 'W'), hits: 14 }
    const frames = resolveRound([a, b], { a: standFast, b: standFast }, scripted(6))
    expect(frames[0].eliminatedIds).toContain('b')
    // b rolls 6 as it dies; a's armour halves that to 3, but it still lands
    expect(frames[0].units.find((u) => u.id === 'a')?.hits).toBe(3)
  })

  it('fights only after the tick has moved everyone', () => {
    const charger = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const target = unit('b', 'cavalry', 'enemy', 2, 3, 'W')
    const frames = resolveRound(
      [charger, target],
      { a: queue(tickOrder(null, 1), hold, hold), b: standFast },
      scripted(3),
    )
    expect(frames[0].engagements).toHaveLength(1)
  })
})

describe('orderCode', () => {
  it('reads an undecided tick, a hold, a wheel and an advance', () => {
    expect(orderCode(null)).toBe('···')
    expect(orderCode(tickOrder(null, 0))).toBe('HLD')
    expect(orderCode(tickOrder('left', 0))).toBe('L60')
    expect(orderCode(tickOrder(null, 1))).toBe('ADV')
    expect(orderCode(tickOrder('right', 1))).toBe('R60·ADV')
    expect(orderCode(tickOrder(null, 2))).toBe('ADV×2')
  })
})
