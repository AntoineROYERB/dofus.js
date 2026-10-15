# 4. A fight can be played between teams

- Status: proposed
- Date: 2026-10-15
- Plan: [Endless Dreams](../plans/endless-dream.md)

## Context

Every fight so far has been a duel. The engine said so in three places: a
room held exactly two (`MaxPlayersPerRoom = MinPlayers`), placement opened the
moment the second fighter sat down, and a fight ended when one fighter was
left standing. The bot, for its part, took everyone who was not itself for an
enemy.

Endless Dreams puts a party of one to three players against a room of one to
six monsters. That needs sides. It must not cost the duel anything: the
recorded fights in `testdata/replays` have to keep replaying byte for byte,
and a duel must not draw anything new from its seed.

## Decision

**A fighter may belong to a team.** `Player.Team` is empty in a duel, where
every fighter is their own side, and `party` or `dream` in a fight between
teams. "Is this an enemy?" becomes "is this on another side?", and in a duel
that is still "is this someone else?".

**A fight seats a fixed number.** `Options.Seats` (two by default, nine at
most) is how many fighters the room holds, and placement opens once all of
them are seated. A duel is a fight of two seats, so it still starts the
moment the second fighter arrives.

**A fight ends when one side is left standing.** In a duel that is the last
fighter, as before. A fallen teammate does not lose the fight for their side.
The winner's name is the names of whoever is left on the winning side, and
`WinnerTeam` says which team that is.

**Teams take turns.** Each team's own order is shuffled, then which team opens,
and the teams alternate fighter by fighter. The larger side plays its extra
fighters one after another at the end of the round. A duel keeps its single
shuffle.

**A team starts from one block.** Its fighters share a block of adjacent
cells, a cell each and two more, placed opposite the other team's the way a
duel's two blocks are. Teammates see where each other place; the other side
does not, as in a duel.

**Nobody hides from their own side.** Tall grass conceals a fighter from
enemies only.

**The fallen stand nowhere.** A fighter who falls keeps the cell they fell on
(so a spell can find them again), but no longer blocks it. In a duel this never
mattered, because a fall ends the fight; in a fight between teams, a body
would wall off its cell for the rest of the fight.

**Spells still hit whoever stands under them.** Friendly fire stays, as in
Dofus: a fireball aimed between two enemies burns the ally standing next to
them too. Zones, pylons going off and drums keep acting on "everyone but
their owner". The bot, on the other hand, never casts a spell that would harm
its own side.

### Recording

Recordings gain two optional fields and no new command:

- `seats`, absent for a duel;
- `team`, on `join` and `add_bot`, absent in a duel.

A duel's recording is therefore exactly what it was, and `RecordingVersion`
does not change.

## Consequences

- `MaxPlayersPerRoom` is gone as a rule: a room's capacity is its game's
  `Capacity()`. The duel lobby still shows rooms of two.
- Turn advancing used to count from wherever its search had got to. When a
  fighter fell to their own wounds as their turn opened, the next fighter was
  skipped, and a fight between teams could stall on a fallen one. It counts
  from the fighter whose turn ended now. A duel never reached that code with
  someone left to skip.
- The bot reads its allies off the board: they stand in the way of its walks
  and its pushes, their pylons are not targets, and a cast that would hurt
  one of them is never weighed.
