# Turn Structure

- **Commitment**: All orders for all units are committed at the start of the
  round, then resolved tick by tick. Orders cannot be changed mid-round.
- **Ticks**: A round is a fixed 3 ticks, regardless of unit type or speed. This
  is the game's own structure, not the book's, and it stays.
- **A tick's order** is an optional 60° wheel (free) followed by zero or more
  advances, limited by the unit's remaining movement allowance.
- **Resolution within a tick**: every unit wheels and advances, then shooting
  resolves, then melee, both at the tick boundary. That is the book's own
  sequence. Speed buys ground, never extra attacks — every unit fights at most
  once per engagement per tick.
- **Blocked moves**: if a unit's destination hex is occupied when its advance
  resolves, the unit stays where it is and the allowance is spent.
- **Contact is combat**: units adjacent at a tick boundary fight, one engagement
  per shared face. See `docs/combat.md`.
- **Shooting** needs a tick the unit did not spend advancing. See
  `docs/shooting.md`.
- **Engaged units are locked** and cannot advance out of a melee. The lock is
  judged as each tick opens. See `docs/combat.md`.
