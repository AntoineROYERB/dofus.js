package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"game-server/internal/game"
)

func TestClassesEndpointServesTheLoadedContent(t *testing.T) {
	cat := game.Content()
	mux := http.NewServeMux()
	RegisterContentRoutes(mux, cat)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/api/classes")
	if err != nil {
		t.Fatalf("GET /api/classes: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	var body ContentResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(body.Classes) != len(cat.Classes) || len(body.Spells) != len(cat.Spells) {
		t.Fatalf("served %d classes and %d spells, want %d and %d",
			len(body.Classes), len(body.Spells), len(cat.Classes), len(cat.Spells))
	}
	for i, class := range cat.Classes {
		if body.Classes[i].ID != class.ID {
			t.Errorf("class %d = %s, want %s — the order is the picker's order", i, body.Classes[i].ID, class.ID)
		}
		for _, id := range class.Spells {
			if _, ok := body.Spells[id]; !ok {
				t.Errorf("%s's spell %s is not in the response", class.ID, id)
			}
		}
	}
}
