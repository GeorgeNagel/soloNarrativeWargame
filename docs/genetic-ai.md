# Genetic AI

A genetic algorithm that breeds decision-tree commanders for the tactical game.
A generation plays a gauntlet — every AI against every fixed opponent, on a fresh
set of boards — ranks the population, and lets the top half reproduce. At the end,
every generation's leader plays a playoff and the winner can be saved as a new
named opponent. The code is in `src/ai/`; `npm run evolve` runs it.

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

1. **Gauntlet.** `--games` boards are drawn for the generation, seeded from the
   run's seed and the generation number. Every genome plays every opponent on
   those same boards, each board twice — once from each side. Genomes never play
   each other.
2. **Ranking**, by mean score per game over all opponents, ties broken by mean
   differential. Every opponent gets the same number of games, so each weighs
   the same.
3. **Reproduction.** The top half survives. The best `--elites` genomes carry
   over untouched; the rest of the population is children of two survivors, each
   drawn by a binary tournament so a better rank breeds more often.
4. **The leader is kept aside** for the playoff, once — an elite that leads
   several generations running is entered the first time only.

A generation costs `pop × opponents × games × 2` games: 24 × 2 × 12 × 2 = 1,152
with the defaults. It grows linearly with the population and with each saved
opponent.

### Fresh boards, and the playoff

Every generation draws new boards, so a carried-over leader has to beat boards it
has never seen to stay on top, which keeps a run from fitting itself to one board
set. The price is that a score from one generation is not comparable with a score
from the next: the best score can drop even though the elite that earned it was
carried over unchanged. More boards (`--games`) make that drop smaller.

Because of that, the champion is not simply the last generation's leader. When the
run ends, every generation's leader plays the opponents again on one set of
`--playoff` boards that none of them was ranked on, and the best of those is the
champion.

## Opponents

A run plays two hand-written baselines (below) and **every saved opponent** in
`artifacts/opponents/`. At the end of a run in a terminal, `npm run evolve` asks

```
Save champion as a named opponent? [Y/n]
Name [3f2a1c4e-9b7d-4e21-8a55-0c6f1d2e3b4a]:
```

and an empty name takes the generated one. Names are lowercase letters, digits
and single hyphens, and may not reuse a baseline's name or a saved one. Without a
terminal nothing is saved unless `--save-as NAME` was passed. The file holds the
genome, the run it came from, and its playoff results.

Every later run plays it, so each champion kept makes the set the next one has to
beat harder. `npm run ai:play -- --vs NAME` plays against one by name. To retire
one, delete its file.

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
accumulate — in a 40-generation run under the earlier round-robin fitness they
grew from 3% of the population's nodes at generation 0 to 12% by generation 40,
and the champion carried 19%.

They are not a correctness problem for play, because an unreachable branch is
never evaluated. They are a problem for *reading* a genome, so `describeGenome`
folds them away first and the header reports reachable nodes against the total.
Node counts in the generation table are still raw sizes, which is why the
champion's line and the table do not have to agree.

## Reading a run

```
$ npm run evolve
gen  best    mean    worst   rounds  nodes   close-on-nearest hold-fast
0    0.571   0.393   0.268   22.2    40.8    0.625            0.500
5    0.702   0.580   0.388   19.9    36.9    0.854            0.500
10   0.685   0.579   0.382   21.9    32.0    0.833            0.500
15   0.716   0.613   0.446   21.6    31.5    0.896            0.500
20   0.663   0.554   0.481   21.5    30.8    0.792            0.500

playoff: 17 generation leaders over 50 new boards
  1   g3-12      gen 3    score 0.640  61W 127D 12L
  2   g9-17      gen 9    score 0.636  62W 124D 14L
  3   g8-21      gen 8    score 0.630  60W 126D 14L
  ...

champion g3-12 (generation 3) - 19 nodes, 72.5s
  vs close-on-nearest  61W 27D 12L - win rate 0.745, differential 0.137
  vs hold-fast         0W 100D 0L - win rate 0.500, differential 0.000
```

In that run the mean rises from 0.39 to around 0.6 within a few generations, and
the population beats the charge baseline decisively but never takes a game off
`hold-fast`: every game against it is a draw (see below). The playoff picks a
generation-3 leader over later ones, which is the playoff doing its job: the
later leaders' higher per-generation scores were partly the boards they drew.
Twenty generations of 24 genomes is a little over a minute.

`best`, `mean` and `worst` are scores against the fixed opponents — a win, draw or
loss plus a quarter of the differential, averaged over every game — so they are
absolute: a rising `mean` is the population improving. They are measured on that
generation's boards, so they move with the draw of boards as well; the columns to
the right are the leader's win rate against each opponent on the same boards.

The playoff table ranks the generation leaders on boards none of them has seen,
and its winner is the champion printed below it.

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
every generation's leader, the opponents — saved ones in full, so an opponent
saved since does not change a resumed run — and the random generator's state.
That last part is what makes resuming exact
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
it came from, so its later checkpoints sit next to the earlier ones. Checkpoints
written under the earlier round-robin fitness (version 1) cannot be resumed; their
`champion.json` files still play under `ai:play`.

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

`--vs` takes a baseline name, a saved opponent's name, or another genome file, so two champions can be
played off against each other. `--trace` prints one game round by round — every
unit's order, every shot and melee, and what it cost — which is the quickest way
to see *why* an evolved AI does what it does. `--describe` prints its trees.

`npm run evolve -- --help` and `npm run ai:play -- --help` list every flag. The
ones that matter most:

| Flag | Default | What it does |
| --- | --- | --- |
| `--pop` | 24 | population size; cost is linear in it |
| `--gens` | 20 | generations after the starting one |
| `--games` | 12 | boards per generation, shared by every opponent, each played from both sides |
| `--seed` | 1 | with the saved opponents, the whole run is reproducible from this |
| `--depth` | 6 | maximum tree depth |
| `--mutation` | 0.15 | per-node chance of mutation when a child is made |
| `--elites` | 2 | best genomes carried over untouched |
| `--playoff` | 50 | boards in the final playoff between generation leaders |
| `--every` | 10 | checkpoint interval; 0 writes only the last |
| `--resume` | — | carry on from a checkpoint |
| `--save-as` | — | save the champion under this name without asking |
| `--out-dir` | `artifacts` | where runs and saved opponents live |
| `--run-id` | from the settings | names this run's directory |

## Known limits

- **Raw orders are a hard search space.** Because a leaf holds turns and an
  advance relative to the current facing, a tree has to rediscover "wheel onto
  the enemy, then close" from the `foeWheels` feature. It gets there, but slowly;
  a vocabulary of tactical intents at the leaves would converge far faster at the
  cost of a lower ceiling.
- **Fixed opponents can be exploited.** Fitness is only as broad as the set of
  opponents: a champion can learn to beat these particular commanders rather than
  to play well. Saving champions as opponents widens the set run by run, which is
  the check on that.
- **One board, one rule set.** The board is the fixed 14×14 with no terrain, and
  shooting has no line-of-sight rule yet, so an evolved AI is fitted to those.
