# Movement

- **Grid**: Hex grid. Units face one of the hex's six edges.
- **Shape of a move**: a unit turns, advances in a straight line, then turns
  again. That is the whole of it — a unit cannot dog-leg mid-advance, because the
  only facing the advance follows is the one the first turn phase left it with.
- **Turning is free**. Wheeling 60° costs no part of the movement allowance,
  following the book, where units "may [turn] at the start and/or the end of
  their move". Each phase takes **zero to three** 60° wheels, so a unit may come
  about entirely before it moves, again after it moves, or split the turning
  either side of the advance.
- **Allowance**: each unit type may advance a fixed number of hexes per round —
  2 for Infantry and Archers, 3 for Skirmishers, 4 for Cavalry. See
  `docs/units.md`. An order for more hexes than the type allows is cut to the
  allowance.
- **Advancing** into the faced hex costs 1 hex of the allowance. The advance
  resolves one hex per tick, in lockstep with every other unit's, so a unit can
  follow another into the hex it has just left.
- **Blocked moves**: if the destination hex is occupied when the advance
  resolves, the unit stays where it is and the hex is still spent.
- **Engaged units may not move**. A unit adjacent to a living enemy as the round
  opens is locked in melee: its advance is refused, and it may only turn if the
  attack is on its rear alone. See `docs/combat.md`.
