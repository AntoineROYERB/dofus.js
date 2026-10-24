package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"game-server/internal/store"
)

func (s *Store) SaveRun(ctx context.Context, id string, state json.RawMessage) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO dream_runs (id, state, updated_at) VALUES ($1, $2, now())
		ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
		id, []byte(state))
	if err != nil {
		return fmt.Errorf("save run: %w", err)
	}
	return nil
}

func (s *Store) GetRun(ctx context.Context, id string) (json.RawMessage, error) {
	var state []byte
	err := s.db.QueryRowContext(ctx, `SELECT state FROM dream_runs WHERE id = $1`, id).Scan(&state)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get run: %w", err)
	}
	return state, nil
}

func (s *Store) SaveDreamEntry(ctx context.Context, e store.DreamEntry) error {
	names, err := json.Marshal(e.Names)
	if err != nil {
		return err
	}
	grimoires, err := json.Marshal(e.Grimoires)
	if err != nil {
		return err
	}
	matchIDs, err := json.Marshal(e.MatchIDs)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO dream_entries (run_id, size, floor, turns, names, grimoires, match_ids, ended_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (run_id) DO UPDATE SET
			floor = EXCLUDED.floor, turns = EXCLUDED.turns, names = EXCLUDED.names,
			grimoires = EXCLUDED.grimoires, match_ids = EXCLUDED.match_ids, ended_at = EXCLUDED.ended_at`,
		e.RunID, e.Size, e.Floor, e.Turns, names, grimoires, matchIDs, e.EndedAt.UTC())
	if err != nil {
		return fmt.Errorf("save dream entry: %w", err)
	}
	return nil
}

func (s *Store) Leaderboard(ctx context.Context, size, limit int) ([]store.DreamEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT run_id, size, floor, turns, names, grimoires, match_ids, ended_at
		FROM dream_entries WHERE size = $1
		ORDER BY floor DESC, turns ASC, ended_at ASC
		LIMIT $2`, size, limit)
	if err != nil {
		return nil, fmt.Errorf("leaderboard: %w", err)
	}
	defer rows.Close()
	out := []store.DreamEntry{}
	for rows.Next() {
		var e store.DreamEntry
		var names, grimoires, matchIDs []byte
		if err := rows.Scan(&e.RunID, &e.Size, &e.Floor, &e.Turns, &names, &grimoires, &matchIDs, &e.EndedAt); err != nil {
			return nil, fmt.Errorf("leaderboard row: %w", err)
		}
		if err := json.Unmarshal(names, &e.Names); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(grimoires, &e.Grimoires); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(matchIDs, &e.MatchIDs); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

var _ store.Store = (*Store)(nil)
