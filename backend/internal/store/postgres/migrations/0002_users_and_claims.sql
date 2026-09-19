-- users is who signed in with Google. google_sub is the stable identifier
-- Google guarantees never changes for an account; email is not used as a
-- key because Google allows it to change and does not guarantee the same
-- uniqueness sub does.
CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    google_sub   TEXT NOT NULL UNIQUE,
    email        TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- match_claims links a finished match's anonymous player id to the account
-- that later signed in as that browser, without touching matches.players or
-- match_commands: the event log and its projection stay exactly as played,
-- and a claim is purely additive. First account to claim a given
-- (match_id, anonymous_id) pair keeps it.
CREATE TABLE IF NOT EXISTS match_claims (
    match_id     TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    anonymous_id TEXT NOT NULL,
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, anonymous_id)
);

CREATE INDEX IF NOT EXISTS match_claims_user_id_idx ON match_claims (user_id);
