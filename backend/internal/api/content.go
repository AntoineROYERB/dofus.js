package api

import (
	"net/http"

	"game-server/internal/content"
	"game-server/internal/types"
)

// ContentResponse is everything a client needs to dress a character before it
// has joined a room — the outfits, grimoires, runes and talismans, the
// champions and their sets, the cosmetics, and the spells the bars are built
// from — and to draw the world: its islands in campaign order, and what they
// are made of.
type ContentResponse struct {
	Spells    map[string]types.Spell         `json:"spells"`
	Outfits   []types.Outfit                 `json:"outfits"`
	Grimoires []types.Grimoire               `json:"grimoires"`
	Runes     []types.Rune                   `json:"runes"`
	Talismans []types.Talisman               `json:"talismans"`
	Champions []types.Champion               `json:"champions"`
	Cosmetics []types.Cosmetic               `json:"cosmetics"`
	Terrains  []types.Terrain                `json:"terrains"`
	Bestiary  []types.Monster                `json:"bestiary"`
	Armours   []types.Armour                 `json:"armours"`
	Palettes  map[string]types.IslandPalette `json:"palettes"`
	Islands   []types.Island                 `json:"islands"`
}

// RegisterContentRoutes serves the content the server loaded at startup:
//
//	GET /api/content   every loadout item and every spell, and the world's islands
//
// The landing page needs the loadout items before any WebSocket room exists,
// and a game snapshot only carries spells once play has started, so they get
// their own read-only endpoint. The client keeps no copy of its own.
func RegisterContentRoutes(mux *http.ServeMux, cat content.Catalogue) {
	body := ContentResponse{
		Spells:    cat.Spells,
		Outfits:   cat.Outfits,
		Grimoires: cat.Grimoires,
		Runes:     cat.Runes,
		Talismans: cat.Talismans,
		Champions: cat.Champions,
		Cosmetics: cat.Cosmetics,
		Terrains:  cat.Terrains,
		Bestiary:  cat.Bestiary,
		Armours:   cat.Armours,
		Palettes:  cat.Palettes,
		Islands:   cat.Islands,
	}
	mux.HandleFunc("GET /api/content", func(w http.ResponseWriter, r *http.Request) {
		// Content only changes with a restart, so a browser may keep it for a
		// little while.
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, body)
	})
}
