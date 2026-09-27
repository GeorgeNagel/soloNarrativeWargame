import { describe, expect, it } from 'vitest'
import type { FeatureSpec } from './features'
import { makeRng } from './rng'
import {
  branch,
  copyTree,
  crossover,
  depthOf,
  describeTree,
  evaluate,
  leaf,
  leavesOf,
  mutate,
  nudgeThreshold,
  prune,
  randomThreshold,
  randomTree,
  sizeOf,
  spliceAt,
  subtrees,
} from './tree'
import type { TreeSpec } from './tree'

const FEATURES: readonly FeatureSpec[] = [
  { key: 'range', min: 1, max: 8, step: 1 },
  { key: 'flag', min: 0, max: 1, step: 1 },
  { key: 'share', min: 0, max: 1, step: 0.1 },
]

/** A tree of plain numbers, which is all the machinery needs to be exercised. */
const SPEC: TreeSpec<number> = {
  features: FEATURES,
  randomLeaf: (rng) => rng.range(0, 9),
  nudgeLeaf: (value, rng) => value + (rng.chance(0.5) ? -1 : 1),
  maxDepth: 4,
  leafChance: 0.2,
}

describe('evaluate', () => {
  it('sends a value below the threshold down the low branch', () => {
    const tree = branch('range', 3, leaf('near'), leaf('far'))
    expect(evaluate(tree, { range: 2 })).toBe('near')
    expect(evaluate(tree, { range: 3 })).toBe('far')
    expect(evaluate(tree, { range: 8 })).toBe('far')
  })

  it('reads a feature the vector does not carry as zero', () => {
    const tree = branch('missing', 1, leaf('low'), leaf('high'))
    expect(evaluate(tree, { range: 5 })).toBe('low')
  })
})

describe('shape', () => {
  const tree = branch('range', 3, leaf(1), branch('flag', 0.5, leaf(2), leaf(3)))

  it('measures depth and size', () => {
    expect(depthOf(leaf(1))).toBe(1)
    expect(depthOf(tree)).toBe(3)
    expect(sizeOf(tree)).toBe(5)
  })

  it('lists leaves left to right', () => {
    expect(leavesOf(tree)).toEqual([1, 2, 3])
  })

  it('copies without sharing structure', () => {
    const copy = copyTree(tree)
    expect(copy).toEqual(tree)
    expect(copy).not.toBe(tree)
    if (copy.kind === 'branch' && tree.kind === 'branch') {
      expect(copy.below).not.toBe(tree.below)
    }
  })

  it('indexes subtrees root first, low side before high', () => {
    expect(subtrees(tree).map(sizeOf)).toEqual([5, 1, 3, 1, 1])
  })
})

describe('spliceAt', () => {
  const tree = branch('range', 3, leaf(1), branch('flag', 0.5, leaf(2), leaf(3)))

  it('replaces the whole tree at index zero', () => {
    expect(spliceAt(tree, 0, leaf(9))).toEqual(leaf(9))
  })

  it('replaces the low subtree at index one', () => {
    expect(leavesOf(spliceAt(tree, 1, leaf(9)))).toEqual([9, 2, 3])
  })

  it('replaces a subtree on the high side', () => {
    expect(leavesOf(spliceAt(tree, 2, leaf(9)))).toEqual([1, 9])
  })

  it('leaves the tree alone for an index past its end', () => {
    expect(spliceAt(tree, 99, leaf(9))).toEqual(tree)
  })
})

describe('prune', () => {
  it('collapses anything past the depth limit into a leaf it held', () => {
    const deep = branch(
      'range',
      3,
      branch('range', 5, leaf(1), leaf(2)),
      leaf(3),
    )
    const cut = prune(deep, 2)
    expect(depthOf(cut)).toBe(2)
    expect(leavesOf(cut)).toEqual([1, 3])
  })

  it('leaves a tree inside the limit untouched', () => {
    const tree = branch('range', 3, leaf(1), leaf(2))
    expect(prune(tree, 4)).toEqual(tree)
  })
})

describe('thresholds', () => {
  it('lands between the steps of a feature, never on one', () => {
    const rng = makeRng(1)
    for (let i = 0; i < 200; i += 1) {
      const threshold = randomThreshold(FEATURES[0], rng)
      expect(threshold % 1).toBeCloseTo(0.5, 10)
      expect(threshold).toBeGreaterThan(1)
      expect(threshold).toBeLessThan(8)
    }
  })

  it('never splits a flag anywhere but the middle', () => {
    const rng = makeRng(2)
    for (let i = 0; i < 100; i += 1) {
      expect(randomThreshold(FEATURES[1], rng)).toBe(0.5)
      expect(nudgeThreshold(FEATURES[1], 0.5, rng)).toBe(0.5)
    }
  })

  it('nudges by a step and stays inside the range', () => {
    const rng = makeRng(3)
    for (let i = 0; i < 200; i += 1) {
      const moved = nudgeThreshold(FEATURES[2], 0.05, rng)
      expect(moved).toBeGreaterThanOrEqual(0.05)
      expect(moved).toBeLessThanOrEqual(0.95)
    }
  })
})

describe('randomTree', () => {
  it('stays inside the depth limit and only tests known features', () => {
    const keys = new Set(FEATURES.map((feature) => feature.key))
    const rng = makeRng(4)
    for (let i = 0; i < 200; i += 1) {
      const tree = randomTree(SPEC, rng)
      expect(depthOf(tree)).toBeLessThanOrEqual(SPEC.maxDepth)
      for (const node of subtrees(tree)) {
        if (node.kind === 'branch') expect(keys.has(node.feature)).toBe(true)
      }
    }
  })
})

describe('crossover and mutate', () => {
  it('keeps children inside the depth limit', () => {
    const rng = makeRng(5)
    for (let i = 0; i < 300; i += 1) {
      const a = randomTree(SPEC, rng)
      const b = randomTree(SPEC, rng)
      const child = crossover(a, b, SPEC, rng)
      expect(depthOf(child)).toBeLessThanOrEqual(SPEC.maxDepth)
      expect(depthOf(mutate(child, SPEC, rng, 0.3))).toBeLessThanOrEqual(SPEC.maxDepth)
    }
  })

  it('does not disturb the parents', () => {
    const rng = makeRng(6)
    const a = randomTree(SPEC, rng)
    const b = randomTree(SPEC, rng)
    const before = JSON.stringify([a, b])
    crossover(a, b, SPEC, rng)
    mutate(a, SPEC, rng, 1)
    expect(JSON.stringify([a, b])).toBe(before)
  })

  it('leaves a tree alone at a mutation rate of zero', () => {
    const rng = makeRng(7)
    const tree = randomTree(SPEC, rng)
    expect(mutate(tree, SPEC, rng, 0)).toEqual(tree)
  })

  it('changes something at a mutation rate of one', () => {
    const rng = makeRng(8)
    let changed = 0
    for (let i = 0; i < 50; i += 1) {
      const tree = randomTree(SPEC, rng)
      if (JSON.stringify(mutate(tree, SPEC, rng, 1)) !== JSON.stringify(tree)) {
        changed += 1
      }
    }
    expect(changed).toBeGreaterThan(40)
  })
})

describe('describeTree', () => {
  it('reads as an indented if/else', () => {
    const tree = branch('range', 3.5, leaf(1), leaf(2))
    expect(describeTree(tree, (value) => `→ ${value}`)).toBe(
      ['range < 3.5', '  → 1', 'else', '  → 2'].join('\n'),
    )
  })
})
