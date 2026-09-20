# Combat Resolution

- **Combat formula**: Wounds inflicted = (Attacker's Attack stat × number of attacking models) − (Defender's Defense stat × number of defending models), computed simultaneously for both sides.
- **Negative/zero results**: Floor at 0 wounds — no other effect.
- **Hit Points (HP)**: Each unit has an HP stat, the number of wounds needed to remove one model from that unit. Models removed in a round = floor(wounds / HP), so multiple models can be removed in a single round.
- **Wound reset**: Wounds reset to 0 at the start of each round. They accumulate across the round's ticks, so repeated clashes wear a unit down within a round.
- **Activation**: Simultaneous — all players commit every unit's orders at the start of the round, then those orders resolve tick by tick (see `docs/turn-structure.md`). Combat resolves at each tick boundary.
- **Melee attack range**: Melee units (e.g. pikemen) can only attack targets in an adjacent hex.
