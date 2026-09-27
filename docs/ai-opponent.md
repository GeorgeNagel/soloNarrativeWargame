# AI Opponent

- **MVP behavior**: Each AI unit advances toward the nearest enemy unit each round.
- **Order logic**: If already adjacent to the nearest enemy, the unit stays and attacks. If not adjacent, it spends its movement points moving/turning to close distance and face the enemy that round (no attack).
- **Where this lives now**: the MVP behaviour above is implemented as
  `closeOnNearest` in `src/ai/baseline.ts`, where it serves as one of the two
  yardsticks the evolved AI is measured against. See `docs/genetic-ai.md`.
- It is a weak opponent, and instructively so: a line that simply stands and
  shoots beats it about four games in five. Advancing forfeits the round's
  shooting, so closing the distance is paid for in hits taken on the way in.
