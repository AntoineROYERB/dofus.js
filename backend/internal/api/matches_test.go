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
