# 1. A match is a seed and a list of accepted commands

- Status: accepted
- Date: 2026-09-07
- Issue: [#39](https://github.com/AntoineROYERB/dofus.js/issues/39)

## Context

The server was already the referee. Every rule lived in `backend/internal/game/`
and the only thing that ever left a `*Game` was `Snapshot()`. That was enough to
play a fight and not enough to do anything else with one: when the room closed,
the match was gone. Nothing to replay, nothing to audit, nothing to test a rule
change against.

A turn-based game is the natural shape for an event log, and this one was most
of the way there already — the RNG was injectable, so a match was *almost* a
pure function of `(seed, ordered commands)`. The word doing the work in that
sentence was "almost".

## Decision

A match is recorded as its inputs plus an append-only list of the commands that
were **accepted**:

```go
type Recording struct {
    Version        int
    Seed           int64
    StartedAt      int64  // Unix ms, anchors the timestamps below
    TurnDurationMS int64
    Rules          string // fingerprint of the numbers this was played under
    Commands       []Command
}
```

`Replay(rec)` rebuilds the match by feeding those commands back through the same
public methods that first accepted them, and asserts each one is accepted again.

### Why a command log and not a state snapshot

A snapshot answers "what did the board look like". A command log answers "how
did it get there", which is the question every use we want asks:

- replaying a fight move by move, and spectating one (#40)
- golden-file regression tests: replay real matches in CI, and an unintended
  rule change breaks the build with a diff of the state it changed
- verifying server-side what a client claimed to do
- a credible answer to "the server is stateful — what happens when it restarts?"

A snapshot log gives none of those, and costs more per turn to boot. The price
is on the other side: a snapshot survives any rule change, and a command log
does not. That price is paid below.

### Only accepted commands go in

Every mutation appends its command *after* the last error return of the method
it belongs to. A refused move leaves no trace at all. This is what keeps
`Replay` honest: it never re-decides validity, it only checks that the same
decision comes out again. A command the rules now refuse is a divergence to be
reported, not a rejection to be swallowed.

## Determinism

This is the substance of the change; the plumbing above was the easy half.

### Seed capture

`Lobby.Create` used to build its RNG from `time.Now().UnixNano()` inside the
constructor, which meant the single input the whole match hung off was never
written down. The seed is now drawn explicitly (`NewSeed`, from `crypto/rand` —
two rooms opened in the same nanosecond would otherwise be dealt the same board)
and handed to `NewWithOptions`, which stores it.

### Generator stability

We keep `math/rand.NewSource`, deliberately. Its sequence for a given seed is
covered by the Go 1 compatibility promise, so a recording made today replays on
a future Go release. What is *not* covered is the top-level `math/rand`
functions' global seeding, which changed in Go 1.20 — the game never uses those;
it always draws from its own `*rand.Rand`.

The consequence to remember: `rand.Shuffle` and `rand.Intn` are part of the wire
format now. Swapping the generator, or changing the *order* in which the game
draws from it, invalidates every existing recording just as surely as changing a
spell's damage does.

### Map iteration order

Go randomises map iteration on every run, so anything that iterates a map and
feeds a decision is a source of divergence. The audit of `game.go`, `rules.go`,
`effects.go` and `bot.go` found:

- **`bot.go`, the spell scan** — a real bug, not a theoretical one. The bot
  picked the highest-damage spell it could afford, and Frost Nova and Drain both
  do 10. The tie was broken by whichever key Go handed out first, so the bot
  played a different spell on different runs of the same board. Fixed: the scan
  walks the catalogue in sorted key order.
- **`bot.go`, `nearestEnemy`** — same shape, ties between equidistant enemies.
  Fixed: sorted by user id.
- **`bot.go`, `stepToward`** — `Reachable` returns a map, and several cells are
  usually the same distance from the target. Fixed: the cells are sorted before
  the scan.
- **`placeBotsLocked`** — iterated `players` to seat bots. Only ever one bot
  today, so it could not bite yet. Fixed anyway, via `sortedPlayerIDsLocked`.
- Everything else that iterates `players` either writes back per-key, builds a
  map, or computes an order-independent answer (`applyTurnFlagsLocked`,
  `checkGameOverLocked`, `returnToLobbyLocked`, `snapshotLocked`). Left alone.
- `playerAtLocked` iterates to find a position, and positions are unique, so
  there is only ever one match to find.

Note what the bot fix does *and does not* buy. Replay feeds the bot's recorded
commands straight back in; it never re-runs `DecideBotAction`, so a
nondeterministic bot would not have broken replay. What it would have broken —
and did — is generating the golden recordings: `go test -update` produced
different matches on each run, which makes every regeneration an unreadable
diff. Determinism here is what lets a golden file mean something.

### Time as an input

Turn timeouts fire on the wall clock, and `turnEndsAt` is published in every
snapshot. A replay that read the real clock would diverge the moment a player
let their turn run out.

`*Game` now owns its clock (`Options.Clock`, defaulting to `time.Now`), and
`Replay` supplies one driven by the recorded timestamps. `ExpireTurnIfDue` reads
that clock instead of taking `now` as an argument — a timeout is a recorded
command like any other, and a command stamped from somewhere the recording
cannot see is not reproducible.

Times are truncated to the millisecond throughout — that is the resolution
snapshots publish deadlines at, and anything finer would not survive the round
trip. Turn durations are truncated on the way in for the same reason, so a
deadline never lands between two representable instants.

### Config as an input

`Rules` is a SHA-256 of the starting stats (from `balance.json`), the whole
spell catalogue, the board radius, the number of starting cells offered and the
obstacle count. `Replay` refuses a mismatch with `ErrRulesChanged` naming both
fingerprints, rather than quietly producing a different fight.

Anything a rule reads and a recording does not name belongs in that hash.

### The bot

`DecideBotAction` decides from a plain `types.GameState` and does not touch the
RNG at all; the only randomness in a bot's turn is the criticals rolled inside
`CastSpell`, from the game's own `rng`. Its actions go through the same
`CastSpell`/`Move`/`EndTurn` as anyone's, so they land in the log the same way.
`AddBot` is recorded too, and `Replay` checks the bot comes back with the same
id.

## Consequences

- A match is now a value. It can be serialised, stored (#40), diffed, and
  replayed on a machine that never saw the original fight.
- `testdata/replays/*.json` holds four real recorded matches — two duels, two
  against the bot, each played through a rematch — with the snapshot each ended
  on. `go test ./...` replays them. Change a spell's damage by one point and the
  fingerprint check fails by name; change what poison *does* without touching a
  number and the snapshot comparison fails with the state that moved.
- **Every rule change potentially invalidates every existing recording.** This
  is the cost of the decision and there is no way around it. The strategy:
  - `RecordingVersion` covers the *shape* of a recording. Bump it when the
    struct or a command kind changes; `Replay` refuses versions it does not
    know.
  - `Rules` covers the *numbers*. It changes on its own, without anyone
    remembering to bump anything, which is the point.
  - Neither covers rule *logic* — that is what the golden files are for. When a
    change to the rules is deliberate, regenerate them with
    `go test ./internal/game -run TestRecordedMatchesStillReplay -update` and
    say so in the commit. A regenerated golden file is a claim that the old
    fight was wrong.
  - Recordings are not migrated. A recording from before a rule change is a
    record of a fight fought under different rules, and rewriting it would be a
    lie about what happened.
- Commands accumulate in memory for as long as a room lives, rematches included.
  A match runs to roughly 60 commands of a few hundred bytes, and a room is
  dropped once it is empty, so this is not worth bounding yet. It becomes worth
  bounding the day recordings are persisted.
- `Restart`, `RemovePlayer` and `SetConnected` changed signature: the first
  takes the player who asked, the other two now report whether they changed
  anything, so `Replay` can tell an accepted command from a no-op.

## Out of scope

Storing recordings anywhere (#40), any UI for watching a replay, and spectator
mode. This decision ends at "a match is a value that can be written down and
reproduced".
