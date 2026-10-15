package game

import (
	"encoding/json"
	"testing"
	"time"

	"game-server/internal/types"
)

// teamFight seats bots on two teams, the party's first. The fight starts on
// its own once every seat is taken, the way a dream's room does.
func teamFight(t *testing.T, seed int64, party, dream []string) (*Game, map[string]string) {
	t.Helper()
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: seed, TurnDuration: time.Hour, Content: &cat, Seats: len(party) + len(dream)})
	teamOf := map[string]string{}
	for _, side := range []struct {
		team      string
		champions []string
	}{{TeamParty, party}, {TeamDream, dream}} {
		for _, champion := range side.champions {
			id, err := g.AddBotOf(BotSpec{Champion: champion, Mode: BotFights, Team: side.team})
			if err != nil {
				t.Fatalf("AddBotOf(%s on %s): %v", champion, side.team, err)
			}
			teamOf[id] = side.team
		}
	}
	return g, teamOf
}

func TestPlacementWaitsForEverySeat(t *testing.T) {
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: 5, TurnDuration: time.Hour, Content: &cat, Seats: 4})
	for i, team := range []string{TeamParty, TeamDream, TeamDream} {
		if _, err := g.AddBotOf(BotSpec{Champion: "ashka", Team: team}); err != nil {
			t.Fatalf("seat %d: %v", i, err)
		}
		if g.Status() != types.StatusCreatingPlayer {
			t.Fatalf("after %d of 4 seats, status = %q: a fight between teams must wait for all of them", i+1, g.Status())
		}
	}
	if err := g.AddPlayerOnTeam("human", "Human", look("Human"), TeamParty); err != nil {
		t.Fatalf("AddPlayerOnTeam: %v", err)
	}
	if g.Status() != types.StatusPositionCharacters {
		t.Fatalf("status = %q once every seat is taken, want placement", g.Status())
	}
	if err := g.AddPlayerOnTeam("late", "Late", look("Late"), TeamParty); err == nil {
		t.Fatal("a fifth fighter was seated in a fight of four")
	}
}

func TestATeamStartsFromOneBlockOfItsOwn(t *testing.T) {
	g, teamOf := teamFight(t, 11, []string{"ashka", "sef"}, []string{"mother-brine", "old-grund", "ashka"})
	g.mu.RLock()
	defer g.mu.RUnlock()

	blocks := map[string][]types.Position{}
	for id, p := range g.players {
		team := teamOf[id]
		if prev, ok := blocks[team]; ok && !samePositions(prev, p.Character.InitialPositions) {
			t.Fatalf("%s was offered %v, its teammate %v: a team shares one block", id, p.Character.InitialPositions, prev)
		}
		blocks[team] = p.Character.InitialPositions
		if p.Character.Position == nil {
			t.Fatalf("%s, a bot, was not placed", id)
		}
	}
	if n := len(blocks[TeamDream]); n < 5 {
		t.Fatalf("a team of three was offered %d cells, want at least a cell each and two more", n)
	}
	for _, cell := range blocks[TeamParty] {
		if containsPosition(blocks[TeamDream], cell) {
			t.Fatalf("%v was offered to both teams", cell)
		}
	}
}

func samePositions(a, b []types.Position) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestTeamsTakeTurnsInTurn(t *testing.T) {
	g, teamOf := teamFight(t, 3, []string{"ashka", "sef"}, []string{"mother-brine", "old-grund", "ashka"})
	order := g.Snapshot().TurnOrder
	if len(order) != 5 {
		t.Fatalf("turn order %v, want all five fighters", order)
	}
	// Two against three: the sides alternate for as long as both have
	// someone left to play, and the larger side's last fighter closes the
	// round.
	for i := 1; i < 4; i++ {
		if teamOf[order[i]] == teamOf[order[i-1]] {
			t.Fatalf("turn order %v: %s and %s are on the same side back to back", order, order[i-1], order[i])
		}
	}
	if teamOf[order[4]] != TeamDream {
		t.Fatalf("turn order %v: the larger side should play last", order)
	}
}

func TestTheFightEndsWhenOneTeamIsDown(t *testing.T) {
	g, teamOf := teamFight(t, 7, []string{"ashka", "sef"}, []string{"mother-brine", "old-grund"})
	g.mu.Lock()
	var partyDown string
	for id, team := range teamOf {
		if team == TeamParty && partyDown == "" {
			partyDown = id
			g.damageLocked(id, 10_000)
		}
	}
	if g.checkGameOverLocked() {
		g.mu.Unlock()
		t.Fatal("the fight ended with a fighter left standing on each side")
	}
	for id, team := range teamOf {
		if team == TeamDream {
			g.damageLocked(id, 10_000)
		}
	}
	over := g.checkGameOverLocked()
	g.mu.Unlock()

	if !over {
		t.Fatal("the fight went on with one side down")
	}
	if got := g.WinnerTeam(); got != TeamParty {
		t.Fatalf("WinnerTeam() = %q, want the party, whose fallen member does not change who won", got)
	}
	winner, _ := g.Winner()
	for id, team := range teamOf {
		if team == TeamParty && id != partyDown {
			if want := g.Snapshot().Players[id].Character.Name; winner != want {
				t.Fatalf("Winner() = %q, want the one who was left standing, %q", winner, want)
			}
		}
	}
}

func TestTeammatesSeeEachOtherPlace(t *testing.T) {
	cat := shippedContent(t)
	g := NewWithOptions(Options{Seed: 2, TurnDuration: time.Hour, Content: &cat, Seats: 3})
	if _, err := g.AddBotOf(BotSpec{Champion: "ashka", Team: TeamDream}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"a", "b"} {
		if err := g.AddPlayerOnTeam(id, id+"-user", look("Player"+id), TeamParty); err != nil {
			t.Fatal(err)
		}
	}
	cell := g.Snapshot().Players["a"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("a", cell); err != nil {
		t.Fatal(err)
	}
	if g.SnapshotFor("b").Players["a"].Character.Position == nil {
		t.Fatal("a teammate's starting cell was hidden from their own side")
	}
	if g.SnapshotFor("bot-1").Players["a"].Character.Position != nil {
		t.Fatal("the other side saw where the party placed before the fight began")
	}
}

// A whole fight between teams, played by bots, has to finish and has to come
// out the same way when its recording is replayed.
func TestABotFightBetweenTeamsFinishesAndReplays(t *testing.T) {
	for _, seed := range []int64{1, 2, 3} {
		g, teamOf := teamFight(t, seed, []string{"ashka", "old-grund"}, []string{"sef", "mother-brine", "ashka"})
		for step := 0; g.Status() == types.StatusPlaying; step++ {
			if step >= stepLimit {
				t.Fatalf("seed %d: still playing after %d steps", seed, stepLimit)
			}
			g.PlayBotStep()
		}
		team := g.WinnerTeam()
		if team == "" {
			t.Fatalf("seed %d: the fight ended with nobody left", seed)
		}
		for id, p := range g.Snapshot().Players {
			if p.Character.IsAlive && teamOf[id] != team {
				t.Fatalf("seed %d: %s of %s still stands, yet %s won", seed, id, teamOf[id], team)
			}
		}

		rec := g.Recording()
		if rec.Seats != 5 {
			t.Fatalf("seed %d: the recording says %d seats, want 5", seed, rec.Seats)
		}
		replayed, err := replayUnder(rec, g)
		if err != nil {
			t.Fatalf("seed %d: replay: %v", seed, err)
		}
		want, _ := json.Marshal(g.Snapshot())
		got, _ := json.Marshal(replayed.Snapshot())
		if string(want) != string(got) {
			t.Fatalf("seed %d: the replay ended somewhere else than the fight", seed)
		}
	}
}

// replayUnder replays a recording under the content the original was played
// with, which a test may have handed in rather than installed.
func replayUnder(rec Recording, original *Game) (*Game, error) {
	at := rec.StartedAt
	g := NewWithOptions(Options{
		Seed:         rec.Seed,
		TurnDuration: time.Duration(rec.TurnDurationMS) * time.Millisecond,
		Clock:        func() time.Time { return time.UnixMilli(at) },
		Island:       rec.Island,
		Seats:        rec.Seats,
		Content:      &original.catalogue,
	})
	for _, cmd := range rec.Commands {
		at = rec.StartedAt + cmd.At
		if err := g.applyCommand(cmd); err != nil {
			return nil, err
		}
	}
	return g, nil
}
