package api

import (
	"net/http"
	"strconv"

	"game-server/internal/content"
	"game-server/internal/store"
)

// leaderboardLimit is how many lines a board shows.
const leaderboardLimit = 20

// RegisterDreamRoutes wires Endless Dreams' leaderboard onto mux:
//
//	GET /api/dreams/leaderboard?size=1|2|3   the best climbs of a party size
func RegisterDreamRoutes(mux *http.ServeMux, dreams store.DreamStore) {
	mux.HandleFunc("GET /api/dreams/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		size := 1
		if raw := r.URL.Query().Get("size"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 1 || n > content.MaxDreamParty {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "size must be 1, 2 or 3"})
				return
			}
			size = n
		}
		entries, err := dreams.Leaderboard(r.Context(), size, leaderboardLimit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"size": size, "entries": entries})
	})
}
