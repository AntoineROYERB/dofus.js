package postgres

import (
	"encoding/json"
	"fmt"

	"game-server/internal/store"
)

type rowScanner interface {
	Scan(dest ...any) error
}

// scanSummary mirrors internal/store/postgres's own scanSummary. It is
// duplicated rather than imported so this package doesn't reach into
// store/postgres's internals for five lines of scanning code.
func scanSummary(row rowScanner) (store.Summary, error) {
	var (
		summary     store.Summary
		playersJSON []byte
	)
	if err := row.Scan(
		&summary.ID, &summary.RoomID, &summary.RoomName,
		&summary.StartedAt, &summary.EndedAt, &summary.Winner,
		&summary.Turns, &summary.DurationMS, &playersJSON,
	); err != nil {
		return store.Summary{}, err
	}
	if len(playersJSON) > 0 {
		if err := json.Unmarshal(playersJSON, &summary.Players); err != nil {
			return store.Summary{}, fmt.Errorf("unmarshal players: %w", err)
		}
	}
	return summary, nil
}
