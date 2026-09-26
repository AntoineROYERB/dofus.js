# Dofus.js

A turn-based tactics game in the spirit of Dofus, built for short sessions on
a phone: a Go server that decides every fight, and a React client that draws
it. The game, its rules and its configuration are described in `README.md`;
this file only holds what is needed to work on the code without breaking it.

## Commands

```bash
cd backend && go run ./cmd/server           # server on :8080 (env vars: README, "Configuration")
cd backend && go test -race ./...            # everything CI runs on the Go side
cd backend && gofmt -l . && go vet ./...
cd backend && go test ./internal/game -run TestRecordedMatchesStillReplay -update  # regenerate golden replays

cd frontend && npm run dev                   # Vite on :5173, talks to ws://localhost:8080/ws
cd frontend && npm test                      # Jest, node environment, no DOM
cd frontend && npm run lint && npm run build # tsc -b + vite build, as CI does
```

## Where things are

```
backend/
  config/               *.json content (spells, classes, islands), embedded and loaded at boot
  internal/content/     loads and validates the content; a bad file stops the server
  internal/game/        the rules: game.go, cast.go, mechanics.go (terrain spells leave),
                        ground.go (island terrain), bot.go, recording.go (replays)
  internal/websocket/   hub, sessions, message handlers
  internal/api/         HTTP: /api/classes (all content), match history
frontend/src/
  components/Game/Grid/ the fight board and its layers
  explore/              the open world: pixel art, client-only
  utils/                pure logic tested without a DOM; board.ts and ground.ts
                        mirror the server's pathing
docs/ART_DIRECTION.md   the visual charter
```

## How the code is built — keep these true

- **The server decides everything.** The client never computes an outcome.
  It only mirrors what it needs for previews, and those mirrors must agree
  with the server: the same path, the same step costs, the same range.
- **A match is a pure function of its seed and its accepted commands.** Every
  roll comes from `g.rng`, and time comes from `g.clock`. Never use
  `time.Now()`, and never depend on map iteration order. A plain arena must
  not draw anything new from the seed, or old recordings stop replaying.
- **Content is data.** A new spell, class, island or terrain is a change to
  `backend/config/*.json`, validated in `internal/content`. Every new field
  gets a validation and a test of the case it refuses.
- **Rules change the fingerprint.** Every number a fight depends on goes into
  `rulesFingerprint` in `recording.go`. Changing one invalidates the golden
  replays in `internal/game/testdata/replays`. Regenerate them with
  `-update`, check that the diff only touches what you meant to change, and
  say so in the commit.

## Conventions

- **Language:**
  - code, comments, in-game text, commits, pull requests and issues: English;
  - conversation with the maintainer: French.
- **Comments explain why.** They say what went wrong before, or what would
  break otherwise, in full sentences. Match the density of the surrounding
  code.
- **Commits:** `type(scope): what changed, in words` (`feat(game): …`,
  `fix(explore): …`), with a body that explains the reasoning.
- **Visual work** (anything drawn, styled or animated) follows
  [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md). Use tokens rather than hex
  values, and at most one vermilion element per screen state. If a rule has
  to change, edit the charter in the same pull request.

## Workflow

- **Branches:**
  - `main` is what Render deploys;
  - `develop` integrates;
  - features branch from `origin/develop` and open pull requests into
    `develop`.
- **Never push to `main` or `develop`.** Commit locally, then ask the
  maintainer before pushing a branch or opening a pull request.
- **Use a worktree** (`git worktree add ../dofus.js-<topic> origin/develop`)
  when the main checkout holds uncommitted work. Leave that work alone.
- **Before calling a change done:**
  - run what CI runs (above);
  - open anything visible in the browser, against a server from the same
    branch.

## Gotchas

- The browser caches `/api/classes` for 5 minutes. After changing content,
  fetch it with `cache: 'reload'`, or the client keeps showing the old data.
- Reduced motion is deliberately ignored in fights (`utils/motion.ts`). Read
  why before "fixing" it.
- TypeScript does not catch a `const` read, inside an arrow function, before
  the line that declares it in the same component. It fails at render time
  instead, so check pages in the browser as well as with `tsc`.
- Sprite sheets and effects under `frontend/public/animation/` can exist
  untracked in the main checkout. Git refuses to switch to a branch that
  tracks the same paths until they are moved.
