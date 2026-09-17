-- matches is the write side's metadata plus match_results' projection,
-- kept in one table for now: there is exactly one projection query today
-- (the list/detail read API), so a separate match_results table would
-- just be this table with extra joins. Split it out if a second
-- projection shows up.
CREATE TABLE IF NOT EXISTS matches (
    id               TEXT PRIMARY KEY,
    room_id          TEXT NOT NULL,
    room_name        TEXT NOT NULL,
    seed             BIGINT NOT NULL,
    rules_hash       TEXT NOT NULL,
    turn_duration_ms BIGINT NOT NULL,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ NOT NULL,
    winner           TEXT NOT NULL DEFAULT '',
    turns            INTEGER NOT NULL DEFAULT 0,
    duration_ms      BIGINT NOT NULL DEFAULT 0,
    players          JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS matches_ended_at_idx ON matches (ended_at DESC, id DESC);

-- match_commands is the log: append-only, and the only thing Reproject
-- reads. Everything else in `matches` besides the identifying columns can
-- be dropped and rebuilt from this table.
CREATE TABLE IF NOT EXISTS match_commands (
    match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    seq      BIGINT NOT NULL,
    at_ms    BIGINT NOT NULL,
    user_id  TEXT NOT NULL,
    kind     TEXT NOT NULL,
    payload  JSONB,
    PRIMARY KEY (match_id, seq)
);
