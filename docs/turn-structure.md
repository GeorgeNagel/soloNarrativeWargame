# Turn Structure

- **Commitment**: All orders for all units are committed at the start of the
  round, then resolved together. Orders cannot be changed once the round runs.
- **A round's order** for one unit is three things in sequence: zero to three
  60° turns, then a straight advance of up to the unit's allowance, then zero to
  three more 60° turns. Nothing else is ordered — there is no attack order and
  no shoot order.
- **Ticks**: the movement resolves tick by tick — the first turn phase, then one
  tick per hex of the longest advance on the board, then the second turn phase.
  Advances run in lockstep, so a unit is blocked by where its neighbours are at
  that tick rather than where they started the round.
- **Combat and shooting happen at the end of all the ticks**, once nothing is
  moving any more: shooting first, then melee, each resolved exactly once in the
  round. Both sets of hits land together and elimination is checked once, after
  them — the book's own sequence, applied to the round as a whole.
- **Contact is combat**: units adjacent when the moving stops are engaged and
  fight, one engagement per shared face. A unit passed on the way through is not
  fought. See `docs/combat.md`.
- **Speed buys ground, never extra attacks.** Cavalry crosses four hexes to
  Infantry's two, and still fights one engagement per contacted face.
- **Shooting** needs a round the unit did not spend advancing. Turning is free,
  so a unit may wheel onto a target and still loose. See `docs/shooting.md`.
- **Blocked moves**: if a unit's destination hex is occupied when its advance
  resolves, the unit stays where it is and the hex is still spent.
- **Engaged units are locked** and cannot advance out of a melee. The lock is
  judged on the board as the round opens. See `docs/combat.md`.
