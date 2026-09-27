# Movement

- **Grid**: Hex grid. Units face one of the hex's six edges.
- **Allowance**: each unit type may advance a fixed number of hexes per round —
  2 for Infantry and Archers, 3 for Skirmishers, 4 for Cavalry. See
  `docs/units.md`.
- **Turning is free**. Wheeling 60° costs no part of the movement allowance,
  following the book, where units "may [turn] at the start and/or the end of
  their move". A unit may wheel once per tick, before its advance.
- **Advancing** into the faced hex costs 1 hex of the allowance. A unit may
  advance more than once in a single tick if it has the allowance for it —
  which is how Cavalry spends 4 hexes across 3 ticks.
- **Blocked moves**: if the destination hex is occupied when the advance
  resolves, the unit stays where it is and the allowance is still spent.
- **Engaged units may not move**. A unit adjacent to a living enemy is locked in
  melee: its advance is refused, and it may only turn if the attack is on its
  rear alone. See `docs/combat.md`.
