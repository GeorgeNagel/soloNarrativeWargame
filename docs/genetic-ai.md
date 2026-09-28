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
board's centre — the shape the hand-written St. Aubin Ford scenario already has.
That reflection preserves every distance on the board, so swapping sides is an
exact rematch and a win says something about the AI rather than about the draw.

On the 14×14 board, with an even number of rows, the reflection maps every hex
onto another hex of the board. An odd-sized board is not closed under it — the
far corner of the bottom row lands one hex off the top row — so `deploymentZone`
drops the hexes whose mirror is off the board rather than distorting the mirror.

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

### Unreachable branches

Crossover freely grafts a test that a branch above it has already decided — a
`foeCanShoot < 0.5` below the branch that took the `foeCanShoot >= 0.5` side,
say. Everything behind that test is then unreachable: no feature vector can get
there. Evolution neither removes these nor is troubled by them, and they
accumulate — in the run below they grow from 3% of the population's nodes at
generation 0 to 12% by generation 40, and the champion carries 19%.

They are not a correctness problem for play, because an unreachable branch is
never evaluated. They are a problem for *reading* a genome, so `describeGenome`
folds them away first and the header reports reachable nodes against the total.
Node counts in the generation table are still raw sizes, which is why the
champion's line and the table do not have to agree.

## Reading a run

```
$ npm run evolve -- --pop 24 --gens 40 --games 2
gen  best    mean    worst   rounds  nodes   bias     close-on-nearest  hold-fast
0    0.710   0.500   0.408   27.0    40.8    -0.004   0.354  0.500
10   0.587   0.500   0.366   22.4    24.1    -0.026   0.563  0.500
20   0.541   0.500   0.428   22.1    28.8    0.008    0.813  0.500
30   0.584   0.500   0.395   18.8    24.5    0.009    0.750  0.500
40   0.602   0.500   0.357   18.3    23.5    -0.064   0.813  0.604

champion g40-8 — 37 nodes, 143.6s
  vs close-on-nearest   32W 5D 3L — win rate 0.863, differential 0.184
  vs hold-fast          6W 34D 0L — win rate 0.575, differential 0.087
```

That run is the shape to expect: the charge baseline is beaten decisively by
generation 20, the static line holds the evolved army to draws for thirty
generations, and only late on does the champion start taking games off it without
ever losing one. Forty generations of 24 genomes is about two and a half minutes.

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

## Checkpoints, and what a run leaves behind

Runs are kept. Each one writes a directory under `artifacts/runs/<run-id>/`,
committed to the repository — `artifacts/README.md` has the layout, and
`src/ai/checkpoint.ts` the code.

A **checkpoint** is a whole paused run: the ranked population, the curve so far,
and the random generator's state. That last part is what makes resuming exact
rather than approximate — a run stopped at generation 20 and resumed is identical
to one that never stopped, which `src/ai/checkpoint.test.ts` asserts by running
both and comparing. Checkpoints land every `--every` generations and always at the
last one.

```
npm run evolve -- --resume artifacts/runs/<run-id>/checkpoints/gen-0040.json --gens 80
```

Everything but the generation count is taken from the checkpoint. Changing the
population size or the scoring mid-run would make the curve meaningless, so those
flags are ignored when resuming. A resumed run writes back into the run directory
it came from, so its later checkpoints sit next to the earlier ones.

Genomes are plain data — trees of numbers and orders — so nothing needs reviving
on load. Everything read off disk is **validated** rather than trusted, since these
files are committed and therefore hand-editable: a bad field fails with its own
name. The one thing tolerated is a branch on a feature this build no longer has,
which reads as zero, so an older checkpoint still loads after a feature is renamed.

## The two scripts

`npm run evolve` runs the algorithm. `npm run ai:play` plays a genome that was
already written down, with no evolution around it:

```
npm run ai:play -- --genome artifacts/runs/<run-id>/champion.json --vs hold-fast
npm run ai:play -- --genome artifacts/runs/<run-id>/champion.json --trace --describe
```

`--vs` takes a baseline name or another genome file, so two saved champions can be
played off against each other. `--trace` prints one game round by round — every
unit's order, every shot and melee, and what it cost — which is the quickest way
to see *why* an evolved AI does what it does. `--describe` prints its trees.

`npm run evolve -- --help` and `npm run ai:play -- --help` list every flag. The
ones that matter most:

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
| `--every` | 10 | checkpoint interval; 0 writes only the last |
| `--resume` | — | carry on from a checkpoint |
| `--out-dir` | `artifacts` | where runs are written |
| `--run-id` | from the settings | names this run's directory |

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
- **One board, one rule set.** The board is the fixed 14×14 with no terrain, and
  shooting has no line-of-sight rule yet, so an evolved AI is fitted to those.
