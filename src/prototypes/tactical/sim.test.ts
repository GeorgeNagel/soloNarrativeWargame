import { describe, expect, it } from 'vitest'

import { hex } from '../../engine'
import type { HexDirection } from '../../engine'
import {
  HITS_TO_ELIMINATE,
  HOLD,
  canShoot,
  canShootAt,
  facingAngle,
  inFieldOfFire,
  isRearAttack,
  orderCode,
  phaseCode,
  roundOrder,
} from './model'
import type { OrderBook, UnitState, UnitType } from './model'
import {
  assessBlow,
  assessShot,
  meleeLock,
  engagementsAmong,
  plannedTicks,
  previewAll,
  resolveRound,
  shootingTarget,
  shotsAmong,
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

/** Everyone stands fast unless the test says otherwise. */
function standFast(...units: UnitState[]): OrderBook {
  return Object.fromEntries(units.map((unit) => [unit.id, HOLD]))
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
  it('advances in a straight line, up to the type allowance', () => {
    const horse = unit('h', 'cavalry', 'player', -1, 3, 'E')
    const { h } = previewAll([horse], { h: roundOrder(0, 4, 0) })
    expect(h.path).toEqual([hex(0, 3), hex(1, 3), hex(2, 3), hex(3, 3)])
    expect(h.pos).toEqual(hex(3, 3))
  })

  it('caps the advance at the type allowance', () => {
    // infantry may move 2 hexes, so the third hex of the order is refused
    const foot = unit('f', 'infantry', 'player', 0, 3, 'E')
    const { f } = previewAll([foot], { f: roundOrder(0, 3, 0) })
    expect(f.pos).toEqual(hex(2, 3))
  })

  it('turns before the advance, so the straight line follows the new facing', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const { m } = previewAll([mover], { m: roundOrder(-1, 2, 0) })
    expect(m.facing).toBe('NE')
    expect(m.path).toEqual([hex(1, 2), hex(2, 1)])
  })

  it('turns after the advance without giving up more ground', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const { m } = previewAll([mover], { m: roundOrder(0, 1, 2) })
    expect(m.pos).toEqual(hex(1, 3))
    // two right wheels from east: SE, then SW
    expect(m.facing).toBe('SW')
  })

  it('wheels up to three edges in a phase, and no further', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const { m } = previewAll([mover], { m: roundOrder(-3, 0, 0) })
    expect(m.facing).toBe('W')
    const over = previewAll([mover], { m: roundOrder(-5, 0, 0) })
    expect(over.m.facing).toBe('W')
  })

  it('turns both ways in one round, six edges in all', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const { m } = previewAll([mover], { m: roundOrder(3, 1, 3) })
    expect(m.facing).toBe('E')
    // three right wheels from east point it west, so the advance runs west
    expect(m.pos).toEqual(hex(-1, 3))
  })

  it('refuses an advance into an occupied hex and marks it blocked', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const wall = unit('w', 'infantry', 'player', 1, 3, 'E')
    const previews = previewAll([mover, wall], {
      m: roundOrder(0, 1, 0),
      w: HOLD,
    })
    expect(previews.m.pos).toEqual(hex(0, 3))
    expect(previews.m.blocked).toBe(true)
  })

  it('refuses an advance off the edge of the board', () => {
    const edge = unit('e', 'cavalry', 'player', 3, 0, 'NE')
    const { e } = previewAll([edge], { e: roundOrder(0, 1, 0) })
    expect(e.blocked).toBe(true)
  })

  it('advances in lockstep, so a follower moves into a hex just vacated', () => {
    const lead = unit('a', 'cavalry', 'player', 1, 3, 'E')
    const follow = unit('b', 'cavalry', 'player', 0, 3, 'E')
    const previews = previewAll([lead, follow], {
      a: roundOrder(0, 1, 0),
      b: roundOrder(0, 1, 0),
    })
    expect(previews.a.pos).toEqual(hex(2, 3))
    expect(previews.b.pos).toEqual(hex(1, 3))
    expect(previews.b.blocked).toBe(false)
  })
})

describe('the ticks of a round', () => {
  it('runs a turn phase, one tick per hex advanced, then a turn phase', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const result = resolveRound([mover], { m: roundOrder(-1, 2, 1) }, scripted(3))
    expect(result.ticks.map((tick) => tick.kind)).toEqual([
      'turn',
      'advance',
      'advance',
      'turn',
    ])
    expect(result.ticks.map((tick) => tick.phase)).toEqual([
      'before',
      'advance',
      'advance',
      'after',
    ])
  })

  it('marks a turn phase nobody used, so playback can skip it', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    const result = resolveRound([mover], { m: roundOrder(0, 1, 2) }, scripted(3))
    expect(result.ticks[0].idle).toBe(true)
    expect(result.ticks[result.ticks.length - 1].idle).toBe(false)
  })

  it('counts the ticks a plan is worth watching', () => {
    const mover = unit('m', 'cavalry', 'player', 0, 3, 'E')
    // one turn phase used, two hexes advanced: three ticks with something in them
    expect(plannedTicks([mover], { m: roundOrder(-1, 2, 0) })).toBe(3)
    expect(plannedTicks([mover], { m: HOLD })).toBe(0)
  })
})

describe('resolveRound', () => {
  it('fights only once all the moving is done', () => {
    const charger = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const target = unit('b', 'cavalry', 'enemy', 2, 3, 'W')
    const result = resolveRound(
      [charger, target],
      { a: roundOrder(0, 1, 0), b: HOLD },
      scripted(3),
    )
    expect(result.engagements).toHaveLength(1)
    expect(result.units.find((u) => u.id === 'b')?.hits).toBe(3)
  })

  it('does not fight a unit it merely passed on the way through', () => {
    // the horse rides past the skirmishers at (2,2) and ends out of reach
    const horse = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const passed = unit('b', 'skirmishers', 'enemy', 2, 2, 'SW')
    const result = resolveRound(
      [horse, passed],
      { a: roundOrder(0, 4, 0), b: HOLD },
      scripted(3),
    )
    expect(result.moved.find((u) => u.id === 'a')?.pos).toEqual(hex(4, 3))
    expect(result.engagements).toHaveLength(0)
    expect(result.units.find((u) => u.id === 'a')?.hits).toBe(0)
  })

  it('lands one engagement a round, not one a tick', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    const result = resolveRound([a, b], standFast(a, b), scripted(3))
    expect(result.units.find((u) => u.id === 'b')?.hits).toBe(3)
    expect(result.units.find((u) => u.id === 'a')?.hits).toBe(3)
  })

  it('accumulates hits from one round to the next', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    const first = resolveRound([a, b], standFast(a, b), scripted(3))
    const second = resolveRound(survivors(first), standFast(a, b), scripted(3))
    expect(second.units.find((u) => u.id === 'b')?.hits).toBe(6)
  })

  it('carries hits taken in an earlier round into the next one', () => {
    const wounded = { ...unit('a', 'cavalry', 'player', 0, 3, 'E'), hits: 10 }
    const b = unit('b', 'cavalry', 'enemy', 1, 3, 'W')
    const result = resolveRound([wounded, b], standFast(wounded, b), scripted(3))
    expect(result.units.find((u) => u.id === 'a')?.hits).toBe(13)
  })

  it('eliminates a unit at 15 hits and leaves it out of the next round', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const b = { ...unit('b', 'cavalry', 'enemy', 1, 3, 'W'), hits: 8 }
    // infantry rolling 6 lands 8 hits, which takes b past 15
    const result = resolveRound([a, b], standFast(a, b), scripted(6))
    expect(result.eliminatedIds).toContain('b')
    expect(result.units.find((u) => u.id === 'b')?.hits).toBe(HITS_TO_ELIMINATE)
    expect(survivors(result).map((u) => u.id)).toEqual(['a'])
  })

  it('lets a unit eliminated this round land its own blow first', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const b = { ...unit('b', 'cavalry', 'enemy', 1, 3, 'W'), hits: 14 }
    const result = resolveRound([a, b], standFast(a, b), scripted(6))
    expect(result.eliminatedIds).toContain('b')
    // b rolls 6 as it dies; a's armour halves that to 3, but it still lands
    expect(result.units.find((u) => u.id === 'a')?.hits).toBe(3)
  })
})

describe('order codes', () => {
  it('reads each phase of an order', () => {
    const order = roundOrder(-2, 3, 1)
    expect(phaseCode(order, 'before')).toBe('L60×2')
    expect(phaseCode(order, 'advance')).toBe('ADV×3')
    expect(phaseCode(order, 'after')).toBe('R60')
    expect(phaseCode(HOLD, 'advance')).toBe('HLD')
    expect(phaseCode(HOLD, 'before')).toBe('—')
    expect(phaseCode(null, 'advance')).toBe('···')
  })

  it('reads a whole order on one line', () => {
    expect(orderCode(null)).toBe('···')
    expect(orderCode(HOLD)).toBe('HLD')
    expect(orderCode(roundOrder(-1, 1, 0))).toBe('L60·ADV')
    expect(orderCode(roundOrder(0, 2, 3))).toBe('ADV×2·R60×3')
  })
})

describe('who may shoot', () => {
  it('lets archers and skirmishers shoot, and nobody else', () => {
    expect(canShoot(unit('a', 'archers', 'player', 0, 3))).toBe(true)
    expect(canShoot(unit('s', 'skirmishers', 'player', 0, 3))).toBe(true)
    expect(canShoot(unit('i', 'infantry', 'player', 0, 3))).toBe(false)
    expect(canShoot(unit('c', 'cavalry', 'player', 0, 3))).toBe(false)
  })
})

describe('field of fire', () => {
  const bow = unit('b', 'archers', 'player', 0, 3, 'E')

  it('covers the faced direction', () => {
    expect(inFieldOfFire(bow, hex(1, 3))).toBe(true)
    expect(inFieldOfFire(bow, hex(3, 3))).toBe(true)
  })

  it('covers a target 45 degrees off the facing but not 60', () => {
    // (2,2) sits 30 degrees off east; the NE neighbour sits a full 60 off
    expect(inFieldOfFire(bow, hex(2, 2))).toBe(true)
    expect(inFieldOfFire(bow, hex(1, 2))).toBe(false)
  })

  it('excludes everything behind the shooter', () => {
    expect(inFieldOfFire(bow, hex(-1, 3))).toBe(false)
    expect(inFieldOfFire(bow, hex(-2, 3))).toBe(false)
  })

  it('excludes the shooter own hex', () => {
    expect(inFieldOfFire(bow, hex(0, 3))).toBe(false)
  })

  it('stops at 4 hexes of range', () => {
    expect(canShootAt(bow, hex(4, 3))).toBe(true)
    expect(canShootAt(bow, hex(5, 3))).toBe(false)
  })

  it('never lets a type that cannot shoot take a shot', () => {
    const horse = unit('h', 'cavalry', 'player', 0, 3, 'E')
    expect(canShootAt(horse, hex(1, 3))).toBe(false)
  })
})

describe('assessShot', () => {
  const soft = unit('t', 'cavalry', 'enemy', 3, 3, 'W')

  it('uses an unmodified die for archers', () => {
    expect(assessShot(unit('a', 'archers', 'player', 0, 3, 'E'), soft, 4).hits).toBe(4)
  })

  it('subtracts 2 for skirmishers, never below zero', () => {
    const skm = unit('s', 'skirmishers', 'player', 0, 3, 'E')
    expect(assessShot(skm, soft, 5).hits).toBe(3)
    expect(assessShot(skm, soft, 1).hits).toBe(0)
  })

  it('halves against armoured infantry, rounding to the shooter', () => {
    const armoured = unit('t', 'infantry', 'enemy', 3, 3, 'W')
    const shot = assessShot(unit('a', 'archers', 'player', 0, 3, 'E'), armoured, 5)
    expect(shot.armoured).toBe(true)
    expect(shot.hits).toBe(3)
  })

  it('gives no rear bonus — that belongs to melee alone', () => {
    const facingAway = unit('t', 'cavalry', 'enemy', 3, 3, 'E')
    expect(assessShot(unit('a', 'archers', 'player', 0, 3, 'E'), facingAway, 4).hits).toBe(4)
  })
})

describe('shootingTarget', () => {
  const bow = unit('b', 'archers', 'player', 0, 3, 'E')

  it('picks the nearest enemy in the cone', () => {
    const near = unit('n', 'cavalry', 'enemy', 2, 3)
    const far = unit('f', 'cavalry', 'enemy', 4, 3)
    expect(shootingTarget(bow, [bow, near, far])?.id).toBe('n')
  })

  it('ignores enemies out of the cone even when they are closer', () => {
    const behind = unit('x', 'cavalry', 'enemy', -1, 3)
    const ahead = unit('y', 'cavalry', 'enemy', 3, 3)
    expect(shootingTarget(bow, [bow, behind, ahead])?.id).toBe('y')
  })

  it('never targets a friend, or an eliminated enemy', () => {
    const friend = unit('p', 'cavalry', 'player', 2, 3)
    const dead = { ...unit('d', 'cavalry', 'enemy', 3, 3), hits: HITS_TO_ELIMINATE }
    expect(shootingTarget(bow, [bow, friend, dead])).toBeNull()
  })

  it('finds nothing when the field is empty ahead', () => {
    expect(shootingTarget(bow, [bow])).toBeNull()
  })
})

describe('shotsAmong', () => {
  const bow = unit('b', 'archers', 'player', 0, 3, 'E')
  const mark = unit('m', 'cavalry', 'enemy', 2, 3, 'W')

  it('looses a shot from a unit that stood still', () => {
    const shots = shotsAmong([bow, mark], new Set(), scripted(4))
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ shooterId: 'b', targetId: 'm', hits: 4 })
  })

  it('denies the shot to a unit that advanced this round', () => {
    expect(shotsAmong([bow, mark], new Set(['b']), scripted(4))).toHaveLength(0)
  })

  it('does not let infantry or cavalry shoot at all', () => {
    const foot = unit('f', 'infantry', 'player', 0, 3, 'E')
    expect(shotsAmong([foot, mark], new Set(), scripted(4))).toHaveLength(0)
  })
})

describe('shooting within a round', () => {
  it('looses once a round, once all the moving is done', () => {
    const bow = unit('b', 'archers', 'player', 0, 3, 'E')
    const mark = unit('m', 'cavalry', 'enemy', 3, 3, 'W')
    const result = resolveRound([bow, mark], standFast(bow, mark), scripted(4))
    expect(result.shots).toHaveLength(1)
    expect(result.units.find((u) => u.id === 'm')?.hits).toBe(4)
  })

  it('lets a unit turn onto a target and still shoot', () => {
    // facing E, the target sits NE — out of the cone until the free wheel
    const bow = unit('b', 'archers', 'player', 0, 3, 'E')
    const mark = unit('m', 'cavalry', 'enemy', 2, 1, 'SW')
    const result = resolveRound(
      [bow, mark],
      { b: roundOrder(-1, 0, 0), m: HOLD },
      scripted(4),
    )
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0].targetId).toBe('m')
  })

  it('shoots along the facing the turns after the advance leave it in', () => {
    // the archers hold their ground and wheel twice, onto a target behind them
    const bow = unit('b', 'archers', 'player', 3, 3, 'E')
    const mark = unit('m', 'cavalry', 'enemy', 1, 3, 'E')
    const result = resolveRound(
      [bow, mark],
      { b: roundOrder(0, 0, 3), m: HOLD },
      scripted(4),
    )
    expect(result.moved.find((u) => u.id === 'b')?.facing).toBe('W')
    expect(result.shots.map((shot) => shot.targetId)).toEqual(['m'])
  })

  it('costs the shot when the round is spent advancing', () => {
    const bow = unit('b', 'archers', 'player', 0, 3, 'E')
    const mark = unit('m', 'cavalry', 'enemy', 4, 3, 'W')
    const result = resolveRound(
      [bow, mark],
      { b: roundOrder(0, 1, 0), m: HOLD },
      scripted(4),
    )
    expect(result.shots).toHaveLength(0)
  })

  it('adds shooting hits and melee hits before checking elimination', () => {
    // archers adjacent to their mark both shoot it and fight it in one round
    const bow = unit('b', 'archers', 'player', 0, 3, 'E')
    const mark = unit('m', 'cavalry', 'enemy', 1, 3, 'W')
    const result = resolveRound([bow, mark], standFast(bow, mark), scripted(4))
    expect(result.shots).toHaveLength(1)
    expect(result.engagements).toHaveLength(1)
    // 4 from the shot plus 4 from the melee
    expect(result.units.find((u) => u.id === 'm')?.hits).toBe(8)
  })
})

describe('meleeLock', () => {
  it('leaves a unit with no adjacent enemy free', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const far = unit('f', 'cavalry', 'enemy', 3, 3, 'W')
    expect(meleeLock(a, [a, far])).toEqual({ engaged: false, frontally: false })
  })

  it('reports a frontal engagement', () => {
    const a = unit('a', 'infantry', 'player', 0, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 1, 3, 'W')
    expect(meleeLock(a, [a, foe])).toEqual({ engaged: true, frontally: true })
  })

  it('reports an engagement that is only on the rear', () => {
    // a faces E; the enemy sits to its west, across a rear edge
    const a = unit('a', 'infantry', 'player', 1, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 0, 3, 'E')
    expect(meleeLock(a, [a, foe])).toEqual({ engaged: true, frontally: false })
  })

  it('counts a front engagement even when a rear one is also present', () => {
    const a = unit('a', 'infantry', 'player', 1, 3, 'E')
    const front = unit('f', 'cavalry', 'enemy', 2, 3, 'W')
    const behind = unit('b', 'cavalry', 'enemy', 0, 3, 'E')
    expect(meleeLock(a, [a, front, behind])).toEqual({ engaged: true, frontally: true })
  })

  it('ignores friends and the eliminated', () => {
    const a = unit('a', 'infantry', 'player', 1, 3, 'E')
    const friend = unit('p', 'cavalry', 'player', 2, 3, 'W')
    const dead = { ...unit('d', 'cavalry', 'enemy', 0, 3, 'E'), hits: HITS_TO_ELIMINATE }
    expect(meleeLock(a, [a, friend, dead])).toEqual({ engaged: false, frontally: false })
  })
})

describe('combat lock', () => {
  const charge = roundOrder(0, 2, 0)

  it('refuses the advance of a unit the enemy already has hold of', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 1, 3, 'W')
    const previews = previewAll([a, foe], { a: charge, x: HOLD })
    expect(previews.a.pos).toEqual(hex(0, 3))
    expect(previews.a.locked).toBe(true)
    expect(previews.a.advanced).toBe(false)
  })

  it('lets a unit held only on its rear turn to meet the attack', () => {
    const a = unit('a', 'cavalry', 'player', 1, 3, 'E')
    const behind = unit('b', 'cavalry', 'enemy', 0, 3, 'E')
    const previews = previewAll([a, behind], {
      a: roundOrder(-1, 0, 0),
      b: HOLD,
    })
    expect(previews.a.facing).toBe('NE')
    expect(previews.a.locked).toBe(false)
  })

  it('refuses the turns when the unit is also held frontally', () => {
    const a = unit('a', 'cavalry', 'player', 1, 3, 'E')
    const front = unit('f', 'cavalry', 'enemy', 2, 3, 'W')
    const behind = unit('b', 'cavalry', 'enemy', 0, 3, 'E')
    const previews = previewAll([a, front, behind], {
      a: roundOrder(-1, 0, 0),
      f: HOLD,
      b: HOLD,
    })
    expect(previews.a.facing).toBe('E')
    expect(previews.a.locked).toBe(true)
  })

  it('judges the lock as the round opens, so a charge closes freely', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 3, 3, 'W')
    const first = resolveRound([a, foe], { a: charge, x: HOLD }, scripted(3))
    // it closes to contact this round, unheld, and fights at the end of it
    expect(first.lockedIds).not.toContain('a')
    expect(first.moved.find((u) => u.id === 'a')?.pos).toEqual(hex(2, 3))
    expect(first.engagements).toHaveLength(1)
    // next round the melee it made has hold of it
    const second = resolveRound(survivors(first), { a: charge, x: HOLD }, scripted(3))
    expect(second.lockedIds).toContain('a')
    expect(second.moved.find((u) => u.id === 'a')?.pos).toEqual(hex(2, 3))
  })

  it('still lets a locked unit shoot, since it never moved', () => {
    const bow = unit('b', 'archers', 'player', 0, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 1, 3, 'W')
    const result = resolveRound([bow, foe], { b: charge, x: HOLD }, scripted(4))
    expect(result.lockedIds).toContain('b')
    expect(result.shots).toHaveLength(1)
    expect(result.shots[0].targetId).toBe('x')
  })

  it('never reports an eliminated unit as locked or moving', () => {
    const dead = { ...unit('d', 'archers', 'player', 1, 3, 'E'), hits: HITS_TO_ELIMINATE }
    const foe = unit('x', 'infantry', 'enemy', 2, 3, 'W')
    const result = resolveRound([dead, foe], { d: charge, x: HOLD }, scripted(6))
    expect(result.lockedIds).not.toContain('d')
    expect(result.blockedIds).not.toContain('d')
    expect(result.engagements).toHaveLength(0)
  })

  it('does not lock a unit that is merely near the enemy', () => {
    const a = unit('a', 'cavalry', 'player', 0, 3, 'E')
    const foe = unit('x', 'cavalry', 'enemy', 3, 3, 'W')
    const previews = previewAll([a, foe], { a: roundOrder(0, 1, 0), x: HOLD })
    expect(previews.a.locked).toBe(false)
    expect(previews.a.pos).toEqual(hex(1, 3))
  })
})
