# Turn Structure

- **Commitment**: All orders for all units are committed at the start of the round, then resolved tick by tick. Orders cannot be changed mid-round.
- **Ticks**: A round is a fixed 3 ticks, regardless of unit type or speed.
- **Order types**: Move to an adjacent hex (1 movement point), turn 60° (1 movement point), hold (1 movement point).
- **Assigning points**: The player assigns each of a unit's movement points to a tick. A 3-point unit therefore spends exactly 1 point per tick; a unit with more points chooses the split (a 5-point unit could take 2/2/1, 1/2/2, and so on).
- **Sub-steps**: Within a tick, units act in lockstep sub-steps, moving one hex at a time. A unit with more points assigned to that tick takes more sub-steps; once its points for the tick are spent, it stands still for the remaining sub-steps.
- **Blocked moves**: If a unit's destination hex is already occupied when its sub-step resolves, the unit stays where it is and the point is spent.
- **Contested hexes**: If two units move into the same empty hex on the same sub-step, the scenario names which side wins contested hexes. That side's unit enters; the other stays where it is, leaving the two adjacent so combat resolves at the tick boundary.
- **Combat timing**: Combat resolves at each tick boundary, so every unit sees 3 combats per round regardless of speed. Speed buys ground and first claim on contested hexes, never extra attacks.
- **Contact is combat**: There is no attack order. Units adjacent at a tick boundary fight.
