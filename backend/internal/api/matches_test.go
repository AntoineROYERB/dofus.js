package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"game-server/internal/game"
	"game-server/internal/store"
	"game-server/internal/store/memory"
	"game-server/internal/types"
)

func newTestServer(t *testing.T) (*httptest.Server, *memory.Store) {
	t.Helper()
	s := memory.New()
	mux := http.NewServeMux()
	RegisterMatchRoutes(mux, s)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, s
}

func seedMatch(t *testing.T, s *memory.Store, id string) {
	t.Helper()
	m := store.Match{
		ID:        id,
		RoomID:    "room-1",
		RoomName:  "Arena",
		StartedAt: time.Now().Add(-time.Minute),
		EndedAt:   time.Now(),
		Winner:    "Alice",
		Turns:     4,
		Players:   []store.Player{{UserID: "u1", UserName: "Alice"}},
		Recording: game.Recording{
			Version: game.RecordingVersion,
			Seed:    7,
			Commands: []game.Command{
				{Seq: 1, Kind: game.CmdJoin, UserID: "u1"},
			},
		},
	}
	if err := s.SaveMatch(t.Context(), m); err != nil {
		t.Fatalf("seed SaveMatch: %v", err)
	}
}

// seedPlayedMatch plays a real bot-vs-human match to completion through the
// game engine and saves it, which is what a recording that ReplaySnapshots
// (unlike a hand-written fixture) can actually accept looks like: a real
// rules fingerprint and a command log the engine itself produced.
func seedPlayedMatch(t *testing.T, s *memory.Store, id string) {
	t.Helper()
	g := game.NewWithOptions(game.Options{Seed: 3, TurnDuration: time.Minute})

	botID, err := g.AddBot()
	if err != nil {
		t.Fatalf("AddBot: %v", err)
	}
	if err := g.AddPlayer("u1", "Alice", types.CharacterAppearance{Name: "Alice"}); err != nil {
		t.Fatalf("AddPlayer: %v", err)
	}
	pos := g.Snapshot().Players["u1"].Character.InitialPositions[0]
	if err := g.ChooseInitialPosition("u1", pos); err != nil {
		t.Fatalf("ChooseInitialPosition: %v", err)
	}
	for step := 0; step < 1200 && g.Status() == types.StatusPlaying; step++ {
		if id, isBot := g.CurrentBot(); isBot && id == botID {
			g.PlayBotStep()
			continue
		}
		action := game.DecideBotAction(g.Snapshot(), "u1")
		switch action.Kind {
		case game.BotCast:
			if g.CastSpell("u1", action.SpellID, action.Target) != nil {
				g.EndTurn("u1")
			}
		case game.BotMove:
			if g.Move("u1", action.Target) != nil {
				g.EndTurn("u1")
			}
		default:
			g.EndTurn("u1")
		}
	}
	if g.Status() != types.StatusGameOver {
		t.Fatalf("status = %q after 1200 steps, want a finished match", g.Status())
	}

	winner, _ := g.Winner()
	rec := g.Recording()
	turns, durationMS := store.TurnsAndDuration(rec)
	m := store.Match{
		ID: id, RoomID: "room-1", RoomName: "Arena",
		StartedAt: time.UnixMilli(rec.StartedAt), EndedAt: time.UnixMilli(rec.StartedAt + durationMS),
		Winner: winner, Turns: turns, DurationMS: durationMS,
		Players:   []store.Player{{UserID: "u1", UserName: "Alice"}},
		Recording: rec,
	}
	if err := s.SaveMatch(t.Context(), m); err != nil {
		t.Fatalf("seed SaveMatch: %v", err)
	}
}

func TestListMatches(t *testing.T) {
	srv, s := newTestServer(t)
	seedMatch(t, s, "m1")
	seedMatch(t, s, "m2")

	resp, err := http.Get(srv.URL + "/api/matches")
	if err != nil {
		t.Fatalf("GET /api/matches: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var page store.Page
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(page.Matches) != 2 {
		t.Fatalf("got %d matches, want 2", len(page.Matches))
	}
}

func TestGetMatchSummary(t *testing.T) {
	srv, s := newTestServer(t)
	seedMatch(t, s, "m1")

	resp, err := http.Get(srv.URL + "/api/matches/m1")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var summary store.Summary
	if err := json.NewDecoder(resp.Body).Decode(&summary); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if summary.Winner != "Alice" {
		t.Errorf("Winner = %q, want Alice", summary.Winner)
	}
}

func TestGetMatchSummaryNotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, err := http.Get(srv.URL + "/api/matches/nope")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestGetRecording(t *testing.T) {
	srv, s := newTestServer(t)
	seedMatch(t, s, "m1")

	resp, err := http.Get(srv.URL + "/api/matches/m1/recording")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var rec game.Recording
	if err := json.NewDecoder(resp.Body).Decode(&rec); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if rec.Seed != 7 || len(rec.Commands) != 1 {
		t.Errorf("recording = %+v, want seed 7 with 1 command", rec)
	}
}

func TestGetSnapshots(t *testing.T) {
	srv, s := newTestServer(t)
	seedPlayedMatch(t, s, "m1")

	recResp, err := http.Get(srv.URL + "/api/matches/m1/recording")
	if err != nil {
		t.Fatalf("GET recording: %v", err)
	}
	defer recResp.Body.Close()
	var rec game.Recording
	if err := json.NewDecoder(recResp.Body).Decode(&rec); err != nil {
		t.Fatalf("decode recording: %v", err)
	}

	resp, err := http.Get(srv.URL + "/api/matches/m1/snapshots")
	if err != nil {
		t.Fatalf("GET snapshots: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var snapshots []types.GameState
	if err := json.NewDecoder(resp.Body).Decode(&snapshots); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(snapshots) != len(rec.Commands) {
		t.Fatalf("got %d snapshots, want one per command (%d)", len(snapshots), len(rec.Commands))
	}
	last := snapshots[len(snapshots)-1]
	if last.GameStatus != types.StatusGameOver {
		t.Errorf("last snapshot status = %q, want %q", last.GameStatus, types.StatusGameOver)
	}
}

func TestGetSnapshotsNotFound(t *testing.T) {
	srv, _ := newTestServer(t)

	resp, err := http.Get(srv.URL + "/api/matches/nope/snapshots")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}
