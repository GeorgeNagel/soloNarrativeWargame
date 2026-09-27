# Artifacts

Output of the genetic algorithm in `src/ai/`, **committed on purpose**. A run
takes minutes and is worth keeping: the checkpoints make a run resumable, the
champions are loadable AIs, and the curves are the record of what the rules
actually reward. See `docs/genetic-ai.md` for the design.

## Layout

```
artifacts/runs/<run-id>/
  run.json                  settings, the whole curve, the final ranking
  curve.csv                 the curve again, one row a generation
  champion.json             the best genome, loadable on its own
  champion.txt              the same genome as indented text, for reading
  checkpoints/gen-NNNN.json the whole run at that generation, resumable
```

A run id is derived from the settings — `pop24-gen40-games2-depth6-seed1` — so
re-running the same line overwrites that run's files rather than piling up
directories, and a differently configured run lands somewhere else. `--run-id`
names one by hand.

## Reproducing a run

The run id says everything the run needs. Every result here comes from

```
npm run evolve -- --pop 24 --gens 40 --games 2 --seed 1
```

and evolution is seeded end to end, so that line reproduces the files byte for
byte on any machine.

## Carrying one on

A checkpoint holds the ranked population, the curve so far and the random
generator's state, so resuming continues the same stream rather than starting a
new one — a run stopped at generation 20 and resumed is identical to one that
never stopped, which `src/ai/checkpoint.test.ts` asserts.

```
npm run evolve -- --resume artifacts/runs/pop24-gen40-games2-depth6-seed1/checkpoints/gen-0040.json --gens 80
```

Everything but the generation count is taken from the checkpoint; changing the
population size or the scoring mid-run would make the curve meaningless, so those
flags are ignored when resuming. A resumed run is the same run carried further, so
it writes back into the same directory, next to the checkpoints already there —
`--run-id` splits it off if you want it kept apart.

## Playing a champion

```
npm run ai:play -- --genome artifacts/runs/pop24-gen40-games2-depth6-seed1/champion.json --vs hold-fast
npm run ai:play -- --genome .../champion.json --trace --describe
```

`--vs` takes either a baseline name or another genome file, so two saved
champions can be played off against each other. `--trace` prints one game round
by round: every unit's order, every shot and melee, and what it cost.

## Reading the numbers

`best` in the curve is the leader's mean score **against its own generation**,
so it does not rise as the population improves — the baseline win-rate columns are
the absolute measure. `mean` is pinned at 0.500 by construction, since every game
hands out exactly one point. This is explained in `docs/genetic-ai.md`.

## Editing these by hand

Checkpoints and champions are validated on load, not trusted, so a hand-edited
file fails with the field it broke rather than quietly changing a run. A branch on
a feature this build no longer has is the one thing tolerated: it reads as zero,
so old checkpoints keep loading after a feature is renamed.
