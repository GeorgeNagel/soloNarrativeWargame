/**
 * The genome's building block: a binary decision tree over the numeric
 * features in `features.ts`, with an arbitrary payload at the leaves.
 *
 * Unit trees carry a `RoundOrder` at the leaves; the army tree carries a
 * posture. Everything here is payload-agnostic, so both use the same growth,
 * crossover and mutation machinery through a `TreeSpec`.
 */
import type { FeatureSpec, Features } from './features'
import type { Rng } from './rng'

export interface Branch<L> {
  kind: 'branch'
  /** A key in the feature record this tree is evaluated against. */
  feature: string
  threshold: number
  /** Taken when the feature is below the threshold. */
  below: Tree<L>
  /** Taken when the feature is at or above it. */
  atOrAbove: Tree<L>
}

export interface Leaf<L> {
  kind: 'leaf'
  value: L
}

export type Tree<L> = Branch<L> | Leaf<L>

/** How to grow, mutate and bound a tree of one payload kind. */
export interface TreeSpec<L> {
  /** The feature space this tree's branches may test. */
  features: readonly FeatureSpec[]
  /** A payload drawn from nothing. */
  randomLeaf: (rng: Rng) => L
  /** A payload nudged from an existing one — the small step mutation wants. */
  nudgeLeaf: (value: L, rng: Rng) => L
  /** Longest root-to-leaf path allowed. Crossover and mutation both respect it. */
  maxDepth: number
  /** Chance a node at depth 0 is a leaf; it rises with depth as the tree grows. */
  leafChance: number
}

export function leaf<L>(value: L): Leaf<L> {
  return { kind: 'leaf', value }
}

export function branch<L>(
  feature: string,
  threshold: number,
  below: Tree<L>,
  atOrAbove: Tree<L>,
): Branch<L> {
  return { kind: 'branch', feature, threshold, below, atOrAbove }
}

// ── evaluation ────────────────────────────────────────────

/**
 * Walk the tree to the payload the features select. A branch on a feature the
 * record does not carry reads as zero, so a tree stays evaluable even if the
 * feature set is trimmed later.
 */
export function evaluate<L>(tree: Tree<L>, features: Features): L {
  let node = tree
  while (node.kind === 'branch') {
    const value = features[node.feature] ?? 0
    node = value < node.threshold ? node.below : node.atOrAbove
  }
  return node.value
}

// ── shape ─────────────────────────────────────────────────

export function depthOf<L>(tree: Tree<L>): number {
  if (tree.kind === 'leaf') return 1
  return 1 + Math.max(depthOf(tree.below), depthOf(tree.atOrAbove))
}

export function sizeOf<L>(tree: Tree<L>): number {
  if (tree.kind === 'leaf') return 1
  return 1 + sizeOf(tree.below) + sizeOf(tree.atOrAbove)
}

export function leavesOf<L>(tree: Tree<L>): L[] {
  if (tree.kind === 'leaf') return [tree.value]
  return [...leavesOf(tree.below), ...leavesOf(tree.atOrAbove)]
}

/** Deep copy, so a child never shares structure with a parent. */
export function copyTree<L>(tree: Tree<L>): Tree<L> {
  if (tree.kind === 'leaf') return leaf(tree.value)
  return branch(
    tree.feature,
    tree.threshold,
    copyTree(tree.below),
    copyTree(tree.atOrAbove),
  )
}

/** Every subtree, root first, in the order `spliceAt` indexes them. */
export function subtrees<L>(tree: Tree<L>): Tree<L>[] {
  if (tree.kind === 'leaf') return [tree]
  return [tree, ...subtrees(tree.below), ...subtrees(tree.atOrAbove)]
}

/** Replace the `index`th subtree (in `subtrees` order) with `graft`. */
export function spliceAt<L>(tree: Tree<L>, index: number, graft: Tree<L>): Tree<L> {
  let seen = 0
  const walk = (node: Tree<L>): Tree<L> => {
    const here = seen
    seen += 1
    if (here === index) return graft
    if (node.kind === 'leaf') return node
    const below = walk(node.below)
    const atOrAbove = walk(node.atOrAbove)
    return branch(node.feature, node.threshold, below, atOrAbove)
  }
  return walk(tree)
}

/**
 * Cut the tree back to `maxDepth`, collapsing anything deeper into one of the
 * leaves it contained. Keeping a real leaf rather than a fresh random one means
 * a pruned child still does something its parents were doing.
 */
export function prune<L>(tree: Tree<L>, maxDepth: number): Tree<L> {
  const walk = (node: Tree<L>, depth: number): Tree<L> => {
    if (node.kind === 'leaf') return node
    if (depth >= maxDepth) return leaf(leavesOf(node)[0])
    return branch(
      node.feature,
      node.threshold,
      walk(node.below, depth + 1),
      walk(node.atOrAbove, depth + 1),
    )
  }
  return walk(tree, 1)
}

// ── growth ────────────────────────────────────────────────

/** A threshold on the mid-points between a feature's steps, never on a step. */
export function randomThreshold(feature: FeatureSpec, rng: Rng): number {
  const steps = Math.max(1, Math.round((feature.max - feature.min) / feature.step))
  const step = rng.range(1, steps)
  return round(feature.min + (step - 0.5) * feature.step)
}

/**
 * Nudge a threshold one step either way, keeping it on a mid-point inside the
 * feature's range. Clamping to the mid-points rather than to `min` and `max` is
 * what stops a nudge from producing a dead branch — a 0/1 feature tested against
 * 0 sends everything down one side.
 */
export function nudgeThreshold(
  feature: FeatureSpec,
  threshold: number,
  rng: Rng,
): number {
  const low = feature.min + feature.step / 2
  const high = Math.max(low, feature.max - feature.step / 2)
  const moved = threshold + (rng.chance(0.5) ? -feature.step : feature.step)
  return round(Math.min(high, Math.max(low, moved)))
}

/** Keep the floating-point step arithmetic from accumulating noise. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function specFor(
  features: readonly FeatureSpec[],
  key: string,
): FeatureSpec | undefined {
  return features.find((feature) => feature.key === key)
}

/**
 * Grow a random tree. The chance of stopping at a leaf rises with depth, so
 * trees start small and the generations that follow deepen them where it pays.
 */
export function randomTree<L>(spec: TreeSpec<L>, rng: Rng, depth = 1): Tree<L> {
  const stop = spec.leafChance + (1 - spec.leafChance) * ((depth - 1) / spec.maxDepth)
  if (depth >= spec.maxDepth || rng.chance(stop)) return leaf(spec.randomLeaf(rng))
  const feature = rng.pick(spec.features)
  return branch(
    feature.key,
    randomThreshold(feature, rng),
    randomTree(spec, rng, depth + 1),
    randomTree(spec, rng, depth + 1),
  )
}

// ── crossover and mutation ────────────────────────────────

/**
 * Subtree crossover: the child is `a` with one of its subtrees replaced by one
 * of `b`'s, then cut back to the depth limit.
 */
export function crossover<L>(
  a: Tree<L>,
  b: Tree<L>,
  spec: TreeSpec<L>,
  rng: Rng,
): Tree<L> {
  const into = rng.int(sizeOf(a))
  const from = subtrees(b)[rng.int(sizeOf(b))]
  return prune(spliceAt(copyTree(a), into, copyTree(from)), spec.maxDepth)
}

/** Relative weights of the five things mutation does to a node. */
export interface MutationWeights {
  /** Move a branch's threshold one step. */
  threshold: number
  /** Point a branch at a different feature. */
  feature: number
  /** Nudge a leaf's payload. */
  nudge: number
  /** Replace a leaf's payload outright. */
  replace: number
  /** Regrow a whole subtree, or collapse a branch into one of its leaves. */
  structure: number
}

export const DEFAULT_MUTATION_WEIGHTS: MutationWeights = {
  threshold: 4,
  feature: 2,
  nudge: 3,
  replace: 2,
  structure: 1,
}

/**
 * Walk every node and, with probability `rate`, change it. Several nodes can
 * mutate in one pass, which is what lets a lineage move more than one step at
 * a time without needing a huge population.
 */
export function mutate<L>(
  tree: Tree<L>,
  spec: TreeSpec<L>,
  rng: Rng,
  rate: number,
  weights: MutationWeights = DEFAULT_MUTATION_WEIGHTS,
): Tree<L> {
  const walk = (node: Tree<L>, depth: number): Tree<L> => {
    if (!rng.chance(rate)) {
      if (node.kind === 'leaf') return leaf(node.value)
      return branch(
        node.feature,
        node.threshold,
        walk(node.below, depth + 1),
        walk(node.atOrAbove, depth + 1),
      )
    }

    if (node.kind === 'leaf') {
      const total = weights.nudge + weights.replace + weights.structure
      const draw = rng.next() * total
      if (draw < weights.nudge) return leaf(spec.nudgeLeaf(node.value, rng))
      if (draw < weights.nudge + weights.replace) return leaf(spec.randomLeaf(rng))
      // grow a branch here, which is how a tree gets deeper at all
      return randomTree(spec, rng, depth)
    }

    const total = weights.threshold + weights.feature + weights.structure
    const draw = rng.next() * total
    if (draw < weights.threshold) {
      const feature = specFor(spec.features, node.feature)
      const threshold = feature
        ? nudgeThreshold(feature, node.threshold, rng)
        : node.threshold
      return branch(
        node.feature,
        threshold,
        walk(node.below, depth + 1),
        walk(node.atOrAbove, depth + 1),
      )
    }
    if (draw < weights.threshold + weights.feature) {
      const feature = rng.pick(spec.features)
      return branch(
        feature.key,
        randomThreshold(feature, rng),
        walk(node.below, depth + 1),
        walk(node.atOrAbove, depth + 1),
      )
    }
    // collapse this branch into one of the leaves it held, pruning the tree
    return leaf(rng.pick(leavesOf(node)))
  }

  return prune(walk(tree, 1), spec.maxDepth)
}

// ── reading a tree ────────────────────────────────────────

/** The tree as indented text, for the champion report. */
export function describeTree<L>(
  tree: Tree<L>,
  show: (value: L) => string,
  indent = '',
): string {
  if (tree.kind === 'leaf') return `${indent}${show(tree.value)}`
  const head = `${indent}${tree.feature} < ${tree.threshold}`
  return [
    head,
    describeTree(tree.below, show, `${indent}  `),
    `${indent}else`,
    describeTree(tree.atOrAbove, show, `${indent}  `),
  ].join('\n')
}
