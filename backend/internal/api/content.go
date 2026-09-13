package api

import (
	"net/http"

	"game-server/internal/content"
	"game-server/internal/types"
)

// ContentResponse is everything a client needs to show the class picker
// before it has joined a room: the classes in picker order, and the spells
// their bars are built from.
type ContentResponse struct {
	Classes []types.Class          `json:"classes"`
	Spells  map[string]types.Spell `json:"spells"`
}

// RegisterContentRoutes serves the content the server loaded at startup:
//
//	GET /api/classes   every class and every spell
//
// The landing page needs the classes before any WebSocket room exists, and a
// game snapshot only carries them once play has started, so they get their
// own read-only endpoint. The client keeps no copy of its own.
func RegisterContentRoutes(mux *http.ServeMux, cat content.Catalogue) {
	body := ContentResponse{Classes: cat.Classes, Spells: cat.Spells}
	mux.HandleFunc("GET /api/classes", func(w http.ResponseWriter, r *http.Request) {
		// Content only changes with a restart, so a browser may keep it for a
		// little while.
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, body)
	})
}
