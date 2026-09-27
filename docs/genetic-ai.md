# Genetic AI

A genetic algorithm that breeds decision-tree commanders for the tactical game.
A generation plays a round robin — every AI against every other AI and against
itself, several games per pairing — ranks the population, and lets the top half
reproduce. The code is in `src/ai/`; `npm run evolve` runs it.

## A genome

Five decision trees:

- **four unit trees**, one per type in `docs/units.md`, each evaluated once per
  living unit of that type;
- **one army tree**, evaluated once a round, which picks a **posture**.

A tree is a binary tree of numeric tests — `foeRange < 2.5` — with a payload at
the leaves. A unit tree's leaves hold a whole `RoundOrder`: a signed count of 60°
wheels, a straight advance, and a second signed count of wheels, exactly the
order the console writes (see `docs/turn-structure.md`). Orders are **relative to
the unit's current facing**, so a tree has to learn hex geometry rather than
being handed it; `foeWheels` — the signed wheels that would point a unit at its
nearest enemy — is the feature that makes that learnable.

The posture is one of four values and **has no hardwired meaning**. The army tree
picks it from the army-level features, and every unit tree gets it as the
`posture` feature. It is a channel the two levels of a genome can learn to agree
on, so an army can coordinate a general advance or a refused flank without any of
that being written in by hand. Nothing forces a lineage to use it.

Every feature a tree may branch on is listed in `src/ai/features.ts`, each with
the range its thresholds are drawn from. Thresholds always land between two steps
of a feature, so a test on a 0/1 flag is always `< 0.5` and no branch is dead.

## A game

`playGame` merges both commanders' order books and calls the same `resolveRound`
the console does — same rules, same dice, except the dice come from a seeded
stream, so any game replays from its seed. A game ends when one side is wiped, at
a 30-round cap, or after three rounds in which nothing moved, shot or fought,
which is how two armies that both stand fast are called off early.

**Scoring** is a win, draw or loss, plus a quarter of the surviving-strength
differential, where strength is the fraction of its starting hit points a side
still has on the board. The differential is what gives selection a gradient in
the first generations, when nearly every game is a draw and pure win rate would
rank at random. A game stopped by the cap is a draw, so the differential is the
only thing separating two armies that never broke each other.

## A scenario

Rosters and deployments are drawn per game: 3–10 units a side, each a random type,
deployed in the two rows nearest that side's own edge. Both sides get the **same**
mix of types, and the enemy deployment is the player's reflected through the
board's centre hex — the shape the hand-written St. Aubin Ford scenario already
has. That reflection preserves every distance on the board, so swapping sides is
an exact rematch and a win says something about the AI rather than about the draw.

The rectangular board is not closed under that reflection — the far corner of the
bottom row lands one hex off the top row — so `deploymentZone` drops the handful
of hexes whose mirror is off the board rather than distorting the mirror.

## A generation

1. **Round robin.** Every pairing `(i, j)` with `i <= j`, self-play included,
   plays `--games` scenarios. Each scenario is played twice, once with each
   genome on the player side, over the same board and the same dice seed.
2. **Ranking**, by mean score per game, ties broken by mean differential.
3. **Reproduction.** The top half survives. The best `--elites` genomes carry
   over untouched; the rest of the population is children of two survivors, each
   drawn by a binary tournament so a better rank breeds more often.

A child is bred **tree by tree**: each of the five trees is crossed over with its
counterpart on its own — a subtree of one parent's cavalry tree replaces a subtree
of the other's — and then mutated. Crossing tree by tree is what lets a good
cavalry tree survive while the infantry tree is recombined. Mutation walks every
node and, per node, moves a threshold one step, repoints a branch at another
feature, nudges or replaces a leaf's order, regrows a subtree, or collapses a
branch into one of the leaves it held. Children are pruned back to the depth limit
by collapsing anything deeper into a leaf it contained.

## Reading a run

```
$ npm run evolve -- --pop 24 --gens 40 --games 2
gen  best    mean    worst   rounds  nodes   bias     close-on-nearest  hold-fast
0    0.702   0.500   0.412   26.9    39.0    -0.001   0.458  0.500
...
```

**The mean score is pinned at 0.500 and always will be** — every game hands out
exactly one point between its two sides, so the mean is an invariant of the round
robin, not a measure of the population. Fitness here is purely relative: a genome
is only ever scored against its own generation, so `best` says how far the leader
is ahead of its own contemporaries, not whether the population is improving.

The two right-hand columns are the absolute curve: the leader's win rate against
each fixed commander in `src/ai/baseline.ts`, over one set of scenarios that never
changes between generations. Those games never feed back into selection, so there
is nothing for the population to overfit to.

`bias` is the mean differential in the self-play games. Because both sides are the
same genome on a mirrored board, anything much away from zero would mean the
player side carries an advantage — a useful check that the scenario generator and
the rules are even-handed. The dice are consumed in roster order, so player units
roll first, which is the one asymmetry left; it measures as noise.

## The baselines, and what they say about the rules

- `hold-fast` — stand still. What the console's enemy does today.
- `close-on-nearest` — the MVP in `docs/ai-opponent.md`: wheel onto the nearest
  enemy, close the distance, then stand and fight.

`hold-fast` is much the stronger of the two: over 40 mirrored scenarios,
`close-on-nearest` wins 4, draws 5 and **loses 31**. Advancing forfeits the
round's shooting (`docs/shooting.md`), so an army that walks across the board is
shot at the whole way in for nothing, and it tends to arrive with a flank open to
a line that never had to turn. Charging is a losing move in these rules as they
stand. It is worth knowing before tuning anything: an evolved AI that draws with
`hold-fast` has found the same equilibrium, not failed to learn.

## Flags

`npm run evolve -- --help` lists them. The ones that matter most:

| Flag | Default | What it does |
| --- | --- | --- |
| `--pop` | 24 | population size; the round robin is O(pop²) |
| `--gens` | 20 | generations after the starting one |
| `--games` | 2 | scenarios per pairing, each played from both sides |
| `--seed` | 1 | the whole run is reproducible from this alone |
| `--depth` | 6 | maximum tree depth |
| `--mutation` | 0.15 | per-node chance of mutation when a child is made |
| `--elites` | 2 | best genomes carried over untouched |
| `--bench` | 12 | benchmark scenarios per generation; 0 skips it |
| `--out` | `artifacts/champion.json` | run report and champion genome |

The champion is written as plain JSON — the trees are data, so a saved genome can
be read back and played without the evolution around it.

## Known limits

- **Raw orders are a hard search space.** Because a leaf holds turns and an
  advance relative to the current facing, a tree has to rediscover "wheel onto
  the enemy, then close" from the `foeWheels` feature. It gets there, but slowly;
  a vocabulary of tactical intents at the leaves would converge far faster at the
  cost of a lower ceiling.
- **Relative fitness can drift.** Co-evolution rewards beating this generation,
  which is not the same as playing well. The benchmark columns are the check on
  that; a rising `best` with a flat benchmark means the population is chasing
  itself.
- **One board, one rule set.** The board is the fixed 7×7 with no terrain, and
  shooting has no line-of-sight rule yet, so an evolved AI is fitted to those.
