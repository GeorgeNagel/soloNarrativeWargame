# Units

- **Unit composition**: A unit is a body of similar troops. Units are not tracked
  model by model — a unit accumulates **hits** and is removed when it has taken
  enough of them (see `docs/combat.md`).
- **Unit types**: Infantry, Archers, Skirmishers, Cavalry. Adapted from the
  Ancient Wargames Rules in Neil Thomas, *One-Hour Wargames*, ch. 3.
- **Sides**: 3–10 units per side.

## Stat lines

| Type | Melee die | Movement | Armour | Shoots |
| --- | --- | --- | --- | --- |
| Infantry | d6 **+2** | 2 hexes | yes | no |
| Archers | d6 | 2 hexes | no | yes, d6, 4 hexes |
| Skirmishers | d6 **−2** | 3 hexes | no | yes, d6 **−2**, 4 hexes |
| Cavalry | d6 | 4 hexes | no | no |

- **Melee die**: the modifier applied to the d6 when this unit inflicts hits in
  hand-to-hand combat. See `docs/combat.md`.
- **Movement**: hexes per round. The book gives distances in inches — Infantry
  and Archers 6", Skirmishers 9", Cavalry 12" — converted here at **3" per hex**.
- **Armour**: an armoured unit halves the hits it *acquires*. It is a property of
  the target, not the attacker.
- **Shooting**: Archers and Skirmishers shoot at 4 hexes — the book's 12" at
  3" per hex. See `docs/shooting.md`.
