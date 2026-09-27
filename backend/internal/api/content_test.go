package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"game-server/internal/game"
)

func TestContentEndpointServesTheLoadedContent(t *testing.T) {
	cat := game.Content()
	mux := http.NewServeMux()
	RegisterContentRoutes(mux, cat)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/api/content")
	if err != nil {
		t.Fatalf("GET /api/content: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}

	var body ContentResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if len(body.Spells) != len(cat.Spells) || len(body.Outfits) != len(cat.Outfits) ||
		len(body.Grimoires) != len(cat.Grimoires) || len(body.Runes) != len(cat.Runes) ||
		len(body.Talismans) != len(cat.Talismans) || len(body.Champions) != len(cat.Champions) {
		t.Fatalf("served %d spells, %d outfits, %d grimoires, %d runes, %d talismans, %d champions; want %d, %d, %d, %d, %d, %d",
			len(body.Spells), len(body.Outfits), len(body.Grimoires), len(body.Runes), len(body.Talismans), len(body.Champions),
			len(cat.Spells), len(cat.Outfits), len(cat.Grimoires), len(cat.Runes), len(cat.Talismans), len(cat.Champions))
	}
	for i, c := range cat.Champions {
		if body.Champions[i].ID != c.ID {
			t.Errorf("champion %d = %s, want %s — the order is the challenge order", i, body.Champions[i].ID, c.ID)
		}
		kit, err := cat.Kit(c.Set)
		if err != nil {
			t.Fatalf("%s's set: %v", c.ID, err)
		}
		for _, id := range kit.Bar {
			if _, ok := body.Spells[id]; !ok {
				t.Errorf("%s's spell %s is not in the response", c.ID, id)
			}
		}
	}
	if body.Cosmetics == nil {
		t.Error("cosmetics is null; an empty list should still be a list")
	}
}
