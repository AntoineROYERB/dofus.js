// Package api is the read-only HTTP API for finished matches: history and
// the recordings a replay view steps through. It sits beside /ws in
// cmd/server/main.go rather than inside the websocket package, because
// unlike everything else the hub serves, a match that already finished has
// nothing left to do with a live connection.
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"game-server/internal/store"
)

const defaultPageLimit = 20

// RegisterMatchRoutes wires the match history endpoints onto mux:
//
//	GET /api/matches?limit=&cursor=   recent finished matches
//	GET /api/matches/{id}             one match's result summary
//	GET /api/matches/{id}/recording   the recording, for Replay
func RegisterMatchRoutes(mux *http.ServeMux, matches store.MatchStore) {
	mux.HandleFunc("GET /api/matches", func(w http.ResponseWriter, r *http.Request) {
		limit := defaultPageLimit
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				limit = n
			}
		}
		page, err := matches.ListMatches(r.Context(), limit, r.URL.Query().Get("cursor"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, page)
	})

	mux.HandleFunc("GET /api/matches/{id}", func(w http.ResponseWriter, r *http.Request) {
		summary, err := matches.GetSummary(r.Context(), r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, summary)
	})

	mux.HandleFunc("GET /api/matches/{id}/recording", func(w http.ResponseWriter, r *http.Request) {
		rec, err := matches.GetRecording(r.Context(), r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, rec)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
