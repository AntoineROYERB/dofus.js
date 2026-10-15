package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"game-server/internal/store"
	"game-server/internal/store/memory"
)

func TestTheLeaderboardIsServedByPartySize(t *testing.T) {
	s := memory.New()
	ctx := context.Background()
	for _, e := range []store.DreamEntry{
		{RunID: "a", Size: 2, Floor: 6, Turns: 20, Names: []string{"A", "B"}, EndedAt: time.Unix(1, 0)},
		{RunID: "b", Size: 2, Floor: 9, Turns: 30, Names: []string{"C", "D"}, EndedAt: time.Unix(2, 0)},
		{RunID: "c", Size: 1, Floor: 12, Turns: 30, Names: []string{"E"}, EndedAt: time.Unix(3, 0)},
	} {
		if err := s.SaveDreamEntry(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	RegisterDreamRoutes(mux, s)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/dreams/leaderboard?size=2", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var body struct {
		Size    int                `json:"size"`
		Entries []store.DreamEntry `json:"entries"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Size != 2 || len(body.Entries) != 2 || body.Entries[0].RunID != "b" {
		t.Fatalf("duo board %+v, want b then a", body)
	}

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/dreams/leaderboard?size=4", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a board of four: status %d, want 400", rec.Code)
	}
}
