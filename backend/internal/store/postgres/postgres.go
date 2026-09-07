// Package postgres is the MatchStore backing DATABASE_URL. It applies its
// own migrations on Open, so nothing but the DSN is required to start.
package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"game-server/internal/game"
	"game-server/internal/store"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type Store struct {
	db *sql.DB
}

// Open connects, applies pending migrations, and returns a ready Store.
func Open(ctx context.Context, dsn string) (*Store, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if err := migrate(ctx, db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) SaveMatch(ctx context.Context, m store.Match) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	players, err := json.Marshal(m.Players)
	if err != nil {
		return fmt.Errorf("marshal players: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO matches (id, room_id, room_name, seed, rules_hash, turn_duration_ms,
			started_at, ended_at, winner, turns, duration_ms, players)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			ended_at = EXCLUDED.ended_at,
			winner = EXCLUDED.winner,
			turns = EXCLUDED.turns,
			duration_ms = EXCLUDED.duration_ms,
			players = EXCLUDED.players`,
		m.ID, m.RoomID, m.RoomName, m.Recording.Seed, m.Recording.Rules, m.Recording.TurnDurationMS,
		m.StartedAt.UTC(), m.EndedAt.UTC(), m.Winner, m.Turns, m.DurationMS, players,
	)
	if err != nil {
		return fmt.Errorf("insert match: %w", err)
	}

	// The command log for this match ID is replaced wholesale: a match is
	// saved once, at game-over, so there is nothing to merge.
	if _, err := tx.ExecContext(ctx, `DELETE FROM match_commands WHERE match_id = $1`, m.ID); err != nil {
		return fmt.Errorf("clear commands: %w", err)
	}
	for _, cmd := range m.Recording.Commands {
		var payload any
		if len(cmd.Payload) > 0 {
			payload = cmd.Payload
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO match_commands (match_id, seq, at_ms, user_id, kind, payload)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			m.ID, cmd.Seq, cmd.At, cmd.UserID, cmd.Kind, payload,
		); err != nil {
			return fmt.Errorf("insert command %d: %w", cmd.Seq, err)
		}
	}

	return tx.Commit()
}

func (s *Store) ListMatches(ctx context.Context, limit int, cursor string) (store.Page, error) {
	if limit <= 0 {
		limit = 20
	}

	var (
		rows *sql.Rows
		err  error
	)
	if cursor == "" {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, room_id, room_name, started_at, ended_at, winner, turns, duration_ms, players
			FROM matches ORDER BY ended_at DESC, id DESC LIMIT $1`, limit+1)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, room_id, room_name, started_at, ended_at, winner, turns, duration_ms, players
			FROM matches
			WHERE (ended_at, id) < (SELECT ended_at, id FROM matches WHERE id = $2)
			ORDER BY ended_at DESC, id DESC LIMIT $1`, limit+1, cursor)
	}
	if err != nil {
		return store.Page{}, fmt.Errorf("list matches: %w", err)
	}
	defer rows.Close()

	var page store.Page
	for rows.Next() {
		summary, err := scanSummary(rows)
		if err != nil {
			return store.Page{}, err
		}
		page.Matches = append(page.Matches, summary)
	}
	if err := rows.Err(); err != nil {
		return store.Page{}, err
	}

	if len(page.Matches) > limit {
		page.NextCursor = page.Matches[limit-1].ID
		page.Matches = page.Matches[:limit]
	}
	return page, nil
}

func (s *Store) GetSummary(ctx context.Context, id string) (store.Summary, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, room_id, room_name, started_at, ended_at, winner, turns, duration_ms, players
		FROM matches WHERE id = $1`, id)
	summary, err := scanSummary(row)
	if err == sql.ErrNoRows {
		return store.Summary{}, store.ErrNotFound
	}
	return summary, err
}

func (s *Store) GetRecording(ctx context.Context, id string) (game.Recording, error) {
	var (
		seed           int64
		startedAt      time.Time
		turnDurationMS int64
		rules          string
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT seed, started_at, turn_duration_ms, rules_hash FROM matches WHERE id = $1`, id,
	).Scan(&seed, &startedAt, &turnDurationMS, &rules)
	if err == sql.ErrNoRows {
		return game.Recording{}, store.ErrNotFound
	}
	if err != nil {
		return game.Recording{}, fmt.Errorf("get match: %w", err)
	}

	commands, err := s.loadCommands(ctx, id)
	if err != nil {
		return game.Recording{}, err
	}

	return game.Recording{
		Version:        game.RecordingVersion,
		Seed:           seed,
		StartedAt:      startedAt.UnixMilli(),
		TurnDurationMS: turnDurationMS,
		Rules:          rules,
		Commands:       commands,
	}, nil
}

func (s *Store) loadCommands(ctx context.Context, matchID string) ([]game.Command, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT seq, at_ms, user_id, kind, payload FROM match_commands
		WHERE match_id = $1 ORDER BY seq ASC`, matchID)
	if err != nil {
		return nil, fmt.Errorf("load commands: %w", err)
	}
	defer rows.Close()

	var commands []game.Command
	for rows.Next() {
		var (
			cmd     game.Command
			payload []byte
		)
		if err := rows.Scan(&cmd.Seq, &cmd.At, &cmd.UserID, &cmd.Kind, &payload); err != nil {
			return nil, fmt.Errorf("scan command: %w", err)
		}
		if len(payload) > 0 {
			cmd.Payload = payload
		}
		commands = append(commands, cmd)
	}
	return commands, rows.Err()
}

// Reproject rebuilds a match's winner/turns/duration by replaying its
// command log and writing the result back. It is what "dropping
// match_results and reprojecting reproduces it identically" means in
// practice: the log never changes, only what is derived from it does.
func (s *Store) Reproject(ctx context.Context, id string) error {
	rec, err := s.GetRecording(ctx, id)
	if err != nil {
		return err
	}

	g, err := game.Replay(rec)
	if err != nil {
		return fmt.Errorf("replay %s: %w", id, err)
	}

	winner, _ := g.Winner()
	turns, durationMS := store.TurnsAndDuration(rec)

	_, err = s.db.ExecContext(ctx, `
		UPDATE matches SET winner = $2, turns = $3, duration_ms = $4 WHERE id = $1`,
		id, winner, turns, durationMS,
	)
	return err
}

func (s *Store) Close() error { return s.db.Close() }

type rowScanner interface {
	Scan(dest ...any) error
}

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

var _ store.MatchStore = (*Store)(nil)
