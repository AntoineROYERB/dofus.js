package game

import (
	"encoding/json"
	"errors"
	"math/rand"
	"testing"
	"time"

	"game-server/internal/types"
)

// epoch anchors every recorded match in these tests. A fixed instant rather
// than time.Now(), so a golden file written today is byte-identical to one
// written tomorrow.
var epoch = time.UnixMilli(1_700_000_000_000)

// fakeClock is the seam a replay uses in production, driven by hand here.
type fakeClock struct{ now time.Time }

func newFakeClock(at time.Time) *fakeClock   { return &fakeClock{now: at} }
func (c *fakeClock) Now() time.Time          { return c.now }
func (c *fakeClock) set(at time.Time)        { c.now = at }
func (c *fakeClock) advance(d time.Duration) { c.now = c.now.Add(d) }

// ---------------------------------------------------------------------------
// The log itself
// ---------------------------------------------------------------------------

func TestOnlyAcceptedActionsAreRecorded(t *testing.T) {
	g := twoPlayerGame(t)
	before := g.CommandCount()

	// Every one of these is refused, for a different reason.
	rejected := []func() error{
		func() error { return g.Move("b", types.Position{X: 1, Y: 3}) },           // not their turn
		func() error { return g.Move("a", types.Position{X: 99, Y: 99}) },         // off the board
		func() error { return g.CastSpell("a", 404, types.Position{X: 0, Y: 3}) }, // no such spell
		func() error { return g.EndTurn("b") },                                    // not their turn
		func() error { return g.Restart("a") },                                    // the match is running
		func() error { return g.ChooseInitialPosition("a", types.Position{}) },    // wrong phase
	}
	for i, action := range rejected {
		if err := action(); err == nil {
			t.Fatalf("action %d was accepted, this test needs it refused", i)
		}
	}
	if got := g.CommandCount(); got != before {
		t.Errorf("rejected actions appended %d commands, want none", got-before)
	}

	// And one that is accepted appends exactly one.
	if err := g.EndTurn("a"); err != nil {
		t.Fatalf("EndTurn: %v", err)
	}
	if got := g.CommandCount(); got != before+1 {
		t.Errorf("an accepted end of turn appended %d commands, want 1", got-before)
	}

	last := g.Recording().Commands[before]
	if last.Kind != CmdEndTurn || last.UserID != "a" {
		t.Errorf("last command = %+v, want an %s from a", last, CmdEndTurn)
	}
}

func TestRecordingSurvivesJSON(t *testing.T) {
	g, _ := playRandomMatch(t, 7, true)
	original := g.Recording()

	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded Recording
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	again, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-marshal: %v", err)
	}
	if string(again) != string(encoded) {
		t.Error("a recording does not survive a JSON round trip unchanged")
	}

	replayed, err := Replay(decoded)
	if err != nil {
		t.Fatalf("replaying the decoded recording: %v", err)
	}
	assertSameSnapshot(t, g, replayed, len(decoded.Commands))
}

func TestReplayRefusesADifferentBalance(t *testing.T) {
	g, _ := playRandomMatch(t, 11, true)
	rec := g.Recording()

	// One point of health, which is the smallest change anyone would make.
	original := StartingHealth
	StartingHealth++
	defer func() { StartingHealth = original }()

	if _, err := Replay(rec); !errors.Is(err, ErrRulesChanged) {
		t.Fatalf("Replay under changed stats = %v, want ErrRulesChanged", err)
	}
}

func TestReplayRefusesAnUnknownVersion(t *testing.T) {
	rec := New().Recording()
	rec.Version = RecordingVersion + 1
	if _, err := Replay(rec); err == nil {
		t.Fatal("a recording from a future version replayed without complaint")
	}
}

// ---------------------------------------------------------------------------
// The property: a match is (seed, commands) and nothing else
// ---------------------------------------------------------------------------

// TestReplayReproducesEveryMatch plays a batch of random-but-valid matches,
// half of them against the bot, and replays each one command by command. The
// snapshot after command n has to be byte-identical to the original's, not
// merely equivalent: the client believes the snapshot and nothing else.
func TestReplayReproducesEveryMatch(t *testing.T) {
	for seed := int64(1); seed <= 12; seed++ {
		withBot := seed%2 == 0
		t.Run(matchName(seed, withBot), func(t *testing.T) {
			g, trace := playRandomMatch(t, seed, withBot)
			rec := g.Recording()

			if len(rec.Commands) < 10 {
				t.Fatalf("only %d commands recorded, this match is too short to prove anything", len(rec.Commands))
			}

			for n := range trace {
				replayed, err := ReplayPrefix(rec, n)
				if err != nil {
					t.Fatalf("replaying the first %d commands: %v", n, err)
				}
				if got := snapshotJSON(t, replayed); got != trace[n] {
					t.Fatalf("snapshot after %d commands differs\n original: %s\nreplayed: %s", n, trace[n], got)
				}
			}
		})
	}
}

func matchName(seed int64, withBot bool) string {
	kind := "duel"
	if withBot {
		kind = "bot"
	}
	return kind + "-" + string(rune('a'+seed-1))
}

// ---------------------------------------------------------------------------
// Driving a match
// ---------------------------------------------------------------------------

// playRandomMatch plays a whole match — placement, a fight, a rematch — out of
// random-but-mostly-sensible actions, and returns the snapshot taken after
// every accepted command, keyed by how many commands had been accepted.
func playRandomMatch(t *testing.T, seed int64, withBot bool) (*Game, map[int]string) {
	t.Helper()

	clock := newFakeClock(epoch)
	g := NewWithOptions(Options{
		Seed: seed,
		// Short enough that letting the clock run is a real possibility, which
		// is what puts timeout commands in the log.
		TurnDuration: 3 * time.Second,
		Clock:        clock.Now,
	})

	trace := map[int]string{0: snapshotJSON(t, g)}
	observe := func() {
		trace[g.CommandCount()] = snapshotJSON(t, g)
	}

	r := rand.New(rand.NewSource(seed * 977))
	humans := []string{"alice"}
	if withBot {
		if _, err := g.AddBot(); err != nil {
			t.Fatalf("AddBot: %v", err)
		}
		observe()
	} else {
		humans = append(humans, "bob")
	}
	for _, id := range humans {
		if err := g.AddPlayer(id, "User-"+id, look(title(id))); err != nil {
			t.Fatalf("AddPlayer %s: %v", id, err)
		}
		observe()
	}

	rematches := 0
	for step := 0; step < 6000; step++ {
		// Time passes between actions, sometimes past the turn deadline.
		clock.advance(time.Duration(200+r.Intn(1600)) * time.Millisecond)

		switch g.Status() {
		case types.StatusPositionCharacters:
			placeSomeone(t, g, humans, r)
			observe()

		case types.StatusPlaying:
			if g.ExpireTurnIfDue() {
				observe()
				continue
			}
			if _, isBot := g.CurrentBot(); isBot {
				if g.PlayBotStep() {
					observe()
				}
				continue
			}
			if takeHumanTurn(g, currentPlayerID(g), r) {
				observe()
			}
			// A player wandering off and coming back is a state change like
			// any other, so it has to be in the log too.
			if r.Intn(40) == 0 {
				id := humans[r.Intn(len(humans))]
				if g.SetConnected(id, r.Intn(2) == 0) {
					observe()
				}
			}

		case types.StatusGameOver:
			if rematches >= 1 {
				return g, trace
			}
			rematches++
			if err := g.Restart(humans[0]); err != nil {
				t.Fatalf("Restart: %v", err)
			}
			observe()
		}
	}
	t.Fatalf("match with seed %d did not finish in 6000 steps", seed)
	return nil, nil
}

func placeSomeone(t *testing.T, g *Game, humans []string, r *rand.Rand) {
	t.Helper()

	state := g.Snapshot()
	for _, id := range humans {
		p := state.Players[id]
		if p.HasPositioned || len(p.Character.InitialPositions) == 0 {
			continue
		}
		cells := p.Character.InitialPositions
		if err := g.ChooseInitialPosition(id, cells[r.Intn(len(cells))]); err != nil {
			t.Fatalf("ChooseInitialPosition for %s: %v", id, err)
		}
		return
	}
	t.Fatal("placement is open but nobody is waiting to be placed")
}

// takeHumanTurn plays one action for a human. It mixes three kinds of player:
// one who plays to win, so matches reach a conclusion; one who picks a spell
// off the bar at something it can actually reach, which is what puts poisons,
// shields and self-buffs in the log; and one who clicks at nothing in
// particular, which is what exercises the actions the game refuses.
func takeHumanTurn(g *Game, id string, r *rand.Rand) bool {
	state := g.Snapshot()
	me := state.Players[id]

	switch roll := r.Intn(10); {
	case roll < 2:
		switch r.Intn(3) {
		case 0:
			return g.Move(id, randomCell(r)) == nil
		case 1:
			return g.CastSpell(id, 1+r.Intn(8), randomCell(r)) == nil
		default:
			return g.EndTurn(id) == nil
		}

	case roll < 5 && me.Character.Position != nil:
		// Aimed at something reachable, so the cast usually lands: a spell
		// that is always refused never gets its effect into a recording.
		target := *me.Character.Position
		if enemy, found := nearestEnemy(state, id, target); found && r.Intn(3) > 0 {
			target = enemy
		}
		if g.CastSpell(id, 1+r.Intn(8), target) == nil {
			return true
		}
	}

	action := DecideBotAction(state, id)
	switch action.Kind {
	case BotCast:
		if g.CastSpell(id, action.SpellID, action.Target) == nil {
			return true
		}
	case BotMove:
		if g.Move(id, action.Target) == nil {
			return true
		}
	}
	return g.EndTurn(id) == nil
}

func randomCell(r *rand.Rand) types.Position {
	for {
		p := types.Position{X: r.Intn(2*GridRadius+1) - GridRadius, Y: r.Intn(2*GridRadius+1) - GridRadius}
		if InGrid(p) {
			return p
		}
	}
}

func title(id string) string {
	return string(rune(id[0]-32)) + id[1:]
}

func snapshotJSON(t *testing.T, g *Game) string {
	t.Helper()
	encoded, err := json.Marshal(g.Snapshot())
	if err != nil {
		t.Fatalf("marshalling a snapshot: %v", err)
	}
	return string(encoded)
}

func assertSameSnapshot(t *testing.T, original, replayed *Game, at int) {
	t.Helper()
	if want, got := snapshotJSON(t, original), snapshotJSON(t, replayed); want != got {
		t.Errorf("snapshot after %d commands differs\n original: %s\nreplayed: %s", at, want, got)
	}
}

// A player walking out mid-fight decides the match, so it is a command like
// any other. Nothing else in the suite exercises it, because a random match
// nobody leaves never records one.
func TestALeaverIsRecordedAndReplayed(t *testing.T) {
	clock := newFakeClock(epoch)
	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Minute, Clock: clock.Now})

	for _, id := range []string{"alice", "bob"} {
		if err := g.AddPlayer(id, "User-"+id, look(title(id))); err != nil {
			t.Fatalf("AddPlayer %s: %v", id, err)
		}
	}
	for _, id := range []string{"alice", "bob"} {
		cells := g.Snapshot().Players[id].Character.InitialPositions
		if err := g.ChooseInitialPosition(id, cells[0]); err != nil {
			t.Fatalf("ChooseInitialPosition %s: %v", id, err)
		}
	}

	clock.advance(2 * time.Second)
	if !g.RemovePlayer("bob") {
		t.Fatal("RemovePlayer reported nothing to remove")
	}
	if g.RemovePlayer("bob") {
		t.Error("removing the same player twice was accepted twice")
	}
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q after a forfeit, want the match decided", g.Status())
	}

	rec := g.Recording()
	if last := rec.Commands[len(rec.Commands)-1]; last.Kind != CmdLeave || last.UserID != "bob" {
		t.Fatalf("last command = %+v, want a %s from bob", last, CmdLeave)
	}

	replayed, err := Replay(rec)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	assertSameSnapshot(t, g, replayed, len(rec.Commands))
}
