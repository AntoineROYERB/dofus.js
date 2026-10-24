-- dream_runs keeps the climbs under way, so a party can pick one back up
-- after the server sleeps. The state is the run as the server holds it,
-- members' keys included: it is never served as it is.
CREATE TABLE IF NOT EXISTS dream_runs (
    id         TEXT PRIMARY KEY,
    state      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- dream_entries is the leaderboard: one line per finished climb, written by
-- the server from fights it refereed.
CREATE TABLE IF NOT EXISTS dream_entries (
    run_id    TEXT PRIMARY KEY,
    size      INTEGER NOT NULL,
    floor     INTEGER NOT NULL,
    turns     INTEGER NOT NULL,
    names     JSONB NOT NULL DEFAULT '[]',
    grimoires JSONB NOT NULL DEFAULT '[]',
    match_ids JSONB NOT NULL DEFAULT '[]',
    ended_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dream_entries_rank_idx ON dream_entries (size, floor DESC, turns ASC, ended_at ASC);
