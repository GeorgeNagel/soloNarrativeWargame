# Combat Resolution

Adapted from the Hand-to-Hand Combat procedure in Neil Thomas, *One-Hour
Wargames*, ch. 3, with one deliberate departure: the book resolves combat one
side at a time during each player's turn, and this game resolves it
simultaneously (see **Simultaneity** below).

## Engagements

- **Contact is combat**: there is no attack order. Two enemy units in adjacent
  hexes once the round's movement is done are engaged and fight. Where a unit
  went on the way there does not matter — an enemy it merely rode past is not
  fought.
- **One engagement per face**: a hex has six faces, and each face carries at
  most one engagement — the book's *Limited Engagement* rule. On a hex grid this
  falls out of the geometry, since a face abuts exactly one hex.
- **An engagement is one mutual fight**, not two attacks. Both units in it roll
  against each other and both results apply. A unit engaged on several faces
  fights a separate engagement on each, and takes the hits from all of them.
- **Once a round.** Melee resolves at the end of the round, after every unit has
  turned, advanced and turned again. A fast unit crosses more ground than a slow
  one; it does not fight more often for it.

## Assessing casualties

Each unit in an engagement rolls one **d6** and applies its type's melee
modifier. The result is the number of hits its opponent acquires:

| Type | Modifier |
| --- | --- |
| Infantry | +2 |
| Archers | — |
| Skirmishers | −2 |
| Cavalry | — |

The result is then modified, **in this order**:

1. **Armour**. An armoured target (Infantry) acquires half the mandated hits.
2. **Flank or Rear**. A unit engaging its enemy's rear inflicts double hits. The
   arcs are defined in `docs/flanking.md`.

Fractions are rounded **in favour of the attacking unit** — that is, rounded up.
Hits never fall below zero.

The book also halves hits against a defender holding advantageous terrain. The
board carries no terrain yet, so that modifier is not implemented.

## Simultaneity

- Both sides of an engagement roll together at the end of the round and both
  results apply. A unit destroyed by an engagement still inflicts its own hits in
  that same engagement — there is no first-strike advantage.
- This replaces the book's *One Sided Combat* rule, which only makes sense in
  its alternating player turns. Orders here are committed for every unit at the
  start of the round and resolve together, so combat resolves together too.

## Movement within combat

- **Engaged units are locked.** Hand-to-hand combat only concludes with the
  elimination of one of the contesting sides, so a unit adjacent to a living
  enemy may not advance. The advance in its order is refused.
- **A unit held only on its rear may turn to meet the attack**, but not if it is
  simultaneously engaged through its front arc. A unit held frontally cannot
  turn at all.
- The lock is judged once, on the board as the round opens. A unit that closes to
  contact during a round moved freely that round and is held for the next one,
  by the melee it made.
- A refused order **costs nothing** — it never happened, so the unit keeps its
  ground and may spend its allowance in a later round, once the melee ends. This
  is unlike an advance blocked by a held hex, which is paid for. A locked unit
  has not moved, so it may still shoot.
- The book lets a unit "turn to face an attack upon their flank or rear". Here
  the turn is not required to be toward the attacker — both turn phases of the
  order are allowed in full, which is a simplification of the book's wording.

Shooting is resolved at the end of the same round, just before the melee, and
its hits are added before elimination is checked. See `docs/shooting.md`.

## Elimination

- A unit is **eliminated once it has acquired 15 hits**.
- Hits are permanent. They accumulate from round to round and are never
  recovered.
- Elimination is checked once a round, after both shooting and melee have landed,
  so a unit shot past 15 hits still fights the melee that killed it.
