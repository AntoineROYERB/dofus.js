// Package postgres is the auth.UserStore backing DATABASE_URL. It shares
// the connection pool internal/store/postgres already opened rather than
// opening a second one; the users and match_claims tables it uses are
// migrated in by that package's migration runner (0002_users_and_claims.sql).
package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"game-server/internal/auth"
	"game-server/internal/store"
)

type Store struct {
	db *sql.DB
}

// New wraps an already-open, already-migrated *sql.DB.
func New(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) UpsertUser(ctx context.Context, googleSub, email, displayName string) (auth.User, error) {
	var u auth.User
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO users (google_sub, email, display_name)
		VALUES ($1, $2, $3)
		ON CONFLICT (google_sub) DO UPDATE SET
			email = EXCLUDED.email,
			display_name = EXCLUDED.display_name
		RETURNING id, google_sub, email, display_name, created_at`,
		googleSub, email, displayName,
	).Scan(&u.ID, &u.GoogleSub, &u.Email, &u.DisplayName, &u.CreatedAt)
	if err != nil {
		return auth.User{}, fmt.Errorf("upsert user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUser(ctx context.Context, id int64) (auth.User, error) {
	var u auth.User
	err := s.db.QueryRowContext(ctx, `
		SELECT id, google_sub, email, display_name, created_at FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.GoogleSub, &u.Email, &u.DisplayName, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return auth.User{}, store.ErrNotFound
	}
	if err != nil {
		return auth.User{}, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

// ClaimMatches attaches every match played under anonymousID to userID.
// It only reads matches.players (via jsonb_array_elements) and inserts into
// match_claims — matches and match_commands, the log and its projection,
// are never written by this feature.
func (s *Store) ClaimMatches(ctx context.Context, userID int64, anonymousID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO match_claims (match_id, anonymous_id, user_id, claimed_at)
		SELECT m.id, $2, $1, now()
		FROM matches m
		WHERE EXISTS (
			SELECT 1 FROM jsonb_array_elements(m.players) AS p
			WHERE p->>'userId' = $2
		)
		ON CONFLICT (match_id, anonymous_id) DO NOTHING`,
		userID, anonymousID,
	)
	if err != nil {
		return fmt.Errorf("claim matches: %w", err)
	}
	return nil
}

func (s *Store) MatchesForUser(ctx context.Context, userID int64, limit int, cursor string) (store.Page, error) {
	if limit <= 0 {
		limit = 20
	}

	var (
		rows *sql.Rows
		err  error
	)
	if cursor == "" {
		rows, err = s.db.QueryContext(ctx, `
			SELECT m.id, m.room_id, m.room_name, m.started_at, m.ended_at, m.winner, m.turns, m.duration_ms, m.players
			FROM matches m
			JOIN match_claims c ON c.match_id = m.id
			WHERE c.user_id = $1
			ORDER BY m.ended_at DESC, m.id DESC LIMIT $2`, userID, limit+1)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT m.id, m.room_id, m.room_name, m.started_at, m.ended_at, m.winner, m.turns, m.duration_ms, m.players
			FROM matches m
			JOIN match_claims c ON c.match_id = m.id
			WHERE c.user_id = $1
			  AND (m.ended_at, m.id) < (SELECT ended_at, id FROM matches WHERE id = $3)
			ORDER BY m.ended_at DESC, m.id DESC LIMIT $2`, userID, limit+1, cursor)
	}
	if err != nil {
		return store.Page{}, fmt.Errorf("list claimed matches: %w", err)
	}
	defer rows.Close()

	page := store.Page{Matches: []store.Summary{}}
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

func (s *Store) Close() error { return nil }

var _ auth.UserStore = (*Store)(nil)
