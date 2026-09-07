package game

import (
	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"game-server/internal/types"
)

// A match used to exist only as the mutable state inside one *Game, and
// Snapshot() was the only thing that ever left it. When the room closed the
// fight was gone: nothing to replay, nothing to audit, nothing to regression
// test against.
//
// This file makes the other half of the state explicit. A match is a pure
// function of its Options and the ordered list of commands that were
// *accepted* — rejected actions never enter the log, so a replay never has to
// re-decide validity, only to check that the same decision comes out again.

// RecordingVersion is bumped whenever the shape of a Recording changes in a
// way older files cannot survive. Replay refuses anything it does not know.
const RecordingVersion = 1

// Command kinds. These strings live in recordings on disk, so they are as
// stable as the version above.
const (
	CmdJoin     = "join"
	CmdAddBot   = "add_bot"
	CmdLeave    = "leave"
	CmdConnect  = "connect"
	CmdPosition = "position"
	CmdMove     = "move"
	CmdCast     = "cast"
	CmdEndTurn  = "end_turn"
	CmdTimeout  = "timeout"
	CmdRestart  = "restart"
)

// Command is one accepted mutation, stamped with its ordinal and the player
// who caused it.
type Command struct {
	Seq int64 `json:"seq"`
	// At is milliseconds since the match started, never wall clock. A turn
	// deadline is derived from it, so it is an input to the replay rather than
	// a note about when this happened to be played.
	At      int64           `json:"at"`
	UserID  string          `json:"userId"`
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Recording is a whole match written down: the inputs it was dealt, and every
// command that was accepted, in order.
type Recording struct {
	Version int `json:"version"`
	// Seed is what the game's randomness was built from.
	Seed int64 `json:"seed"`
	// StartedAt anchors the command timestamps to a real instant. Only the
	// differences matter to a replay; this is what makes them readable.
	StartedAt int64 `json:"startedAt"`
	// TurnDurationMS is part of the state, not a server setting: it is what
	// every turn deadline in every snapshot was computed from.
	TurnDurationMS int64 `json:"turnDurationMs"`
	// Rules fingerprints the numbers the match was played under — starting
	// stats and the whole spell catalogue. A recording made under one balance
	// is not valid under another, and Replay says so rather than quietly
	// producing a different fight.
	Rules    string    `json:"rules"`
	Commands []Command `json:"commands"`
}

// Command payloads. One per kind that carries anything; the rest are empty.
type (
	joinPayload struct {
		UserName  string                    `json:"userName"`
		Character types.CharacterAppearance `json:"character"`
	}
	connectPayload struct {
		Connected bool `json:"connected"`
	}
	positionPayload struct {
		Position types.Position `json:"position"`
	}
	movePayload struct {
		Position types.Position `json:"position"`
	}
	castPayload struct {
		SpellID int            `json:"spellId"`
		Target  types.Position `json:"target"`
	}
)

// ErrRulesChanged is what a recording made under different numbers gets.
var ErrRulesChanged = errors.New("this recording was made under a different balance")

func defaultClock() time.Time { return time.Now() }

// NewSeed draws a seed for a fresh match. It is crypto/rand rather than the
// clock: two rooms opened in the same nanosecond would otherwise be dealt the
// same board, and a seed nobody can guess is one nobody can play against.
func NewSeed() int64 {
	var buf [8]byte
	if _, err := cryptorand.Read(buf[:]); err != nil {
		// Only reachable if the OS entropy pool is broken. A match with a
		// predictable board still beats a room that cannot open.
		return time.Now().UnixNano()
	}
	return int64(binary.LittleEndian.Uint64(buf[:]) >> 1)
}

// RulesFingerprint hashes every number a replay depends on. Starting stats
// come from balance.json and the catalogue is compiled in, but both are just
// numbers the fight was fought under, and changing either invalidates every
// recording made before it.
func RulesFingerprint() string {
	shape := struct {
		Health                 int                    `json:"health"`
		ActionPoints           int                    `json:"actionPoints"`
		MovementPoints         int                    `json:"movementPoints"`
		GridRadius             int                    `json:"gridRadius"`
		InitialPositionChoices int                    `json:"initialPositionChoices"`
		ObstacleCount          int                    `json:"obstacleCount"`
		Spells                 map[string]types.Spell `json:"spells"`
	}{
		Health:                 StartingHealth,
		ActionPoints:           StartingActionPoints,
		MovementPoints:         StartingMovementPoints,
		GridRadius:             GridRadius,
		InitialPositionChoices: InitialPositionChoices,
		ObstacleCount:          ObstacleCount,
		Spells:                 Catalogue(),
	}
	// encoding/json sorts map keys, so the same catalogue always hashes the
	// same way whatever order it was built in.
	encoded, err := json.Marshal(shape)
	if err != nil {
		return "unhashable"
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

// recordLocked appends one accepted command. Every caller sits after the last
// error return of the method it belongs to: an action the game refused leaves
// no trace, which is what lets Replay treat the log as already-validated.
func (g *Game) recordLocked(userID, kind string, payload any) {
	var raw json.RawMessage
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			// Every payload is a flat struct of ints and strings, so this
			// cannot happen; saying so out loud beats a recording that is
			// silently missing a move.
			log.Printf("[Recording] dropped %s from %s: %v", kind, userID, err)
			return
		}
		raw = encoded
	}

	g.cmdSeq++
	g.commands = append(g.commands, Command{
		Seq:     g.cmdSeq,
		At:      g.now().Sub(g.startedAt).Milliseconds(),
		UserID:  userID,
		Kind:    kind,
		Payload: raw,
	})
}

// Recording returns the match so far as a value: serialise it, store it, feed
// it back to Replay.
func (g *Game) Recording() Recording {
	g.mu.RLock()
	defer g.mu.RUnlock()

	return Recording{
		Version:        RecordingVersion,
		Seed:           g.seed,
		StartedAt:      g.startedAt.UnixMilli(),
		TurnDurationMS: g.turnDuration.Milliseconds(),
		Rules:          RulesFingerprint(),
		Commands:       append([]Command(nil), g.commands...),
	}
}

// CommandCount reports how many commands the match has accepted, which is the
// point a prefix replay can be compared against.
func (g *Game) CommandCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.commands)
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

// Replay rebuilds a match by feeding its commands back through the same public
// methods that first accepted them, and asserting each one is accepted again.
// A command the rules now refuse is a divergence, not a rejection to be
// swallowed: it means the game no longer plays the way this recording says it
// did.
func Replay(rec Recording) (*Game, error) {
	if rec.Version != RecordingVersion {
		return nil, fmt.Errorf("recording version %d, this server replays version %d", rec.Version, RecordingVersion)
	}
	if want := RulesFingerprint(); rec.Rules != want {
		return nil, fmt.Errorf("%w: recorded under %s, this server runs %s", ErrRulesChanged, short(rec.Rules), short(want))
	}

	// The clock is the recording. Every command is applied at the instant it
	// was accepted at, so the turn deadlines the replayed snapshots carry are
	// the ones the original carried.
	at := rec.StartedAt
	g := NewWithOptions(Options{
		Seed:         rec.Seed,
		TurnDuration: time.Duration(rec.TurnDurationMS) * time.Millisecond,
		Clock:        func() time.Time { return time.UnixMilli(at) },
	})

	for _, cmd := range rec.Commands {
		at = rec.StartedAt + cmd.At
		if err := g.applyCommand(cmd); err != nil {
			return nil, fmt.Errorf("command %d (%s from %s): %w", cmd.Seq, cmd.Kind, cmd.UserID, err)
		}
	}
	return g, nil
}

// ReplayPrefix replays the first n commands, which is how a replay is compared
// against the original partway through a match.
func ReplayPrefix(rec Recording, n int) (*Game, error) {
	if n > len(rec.Commands) {
		return nil, fmt.Errorf("recording holds %d commands, asked for %d", len(rec.Commands), n)
	}
	rec.Commands = rec.Commands[:n]
	return Replay(rec)
}

func (g *Game) applyCommand(cmd Command) error {
	switch cmd.Kind {
	case CmdJoin:
		var p joinPayload
		if err := json.Unmarshal(cmd.Payload, &p); err != nil {
			return err
		}
		return g.AddPlayer(cmd.UserID, p.UserName, p.Character)

	case CmdAddBot:
		id, err := g.AddBot()
		if err != nil {
			return err
		}
		if id != cmd.UserID {
			return fmt.Errorf("bot was named %s, recording says %s", id, cmd.UserID)
		}
		return nil

	case CmdLeave:
		return accepted(g.RemovePlayer(cmd.UserID), "no such player to remove")

	case CmdConnect:
		var p connectPayload
		if err := json.Unmarshal(cmd.Payload, &p); err != nil {
			return err
		}
		return accepted(g.SetConnected(cmd.UserID, p.Connected), "presence was already what this sets it to")

	case CmdPosition:
		var p positionPayload
		if err := json.Unmarshal(cmd.Payload, &p); err != nil {
			return err
		}
		return g.ChooseInitialPosition(cmd.UserID, p.Position)

	case CmdMove:
		var p movePayload
		if err := json.Unmarshal(cmd.Payload, &p); err != nil {
			return err
		}
		return g.Move(cmd.UserID, p.Position)

	case CmdCast:
		var p castPayload
		if err := json.Unmarshal(cmd.Payload, &p); err != nil {
			return err
		}
		return g.CastSpell(cmd.UserID, p.SpellID, p.Target)

	case CmdEndTurn:
		return g.EndTurn(cmd.UserID)

	case CmdTimeout:
		return accepted(g.ExpireTurnIfDue(), "the turn was not due to expire")

	case CmdRestart:
		return g.Restart(cmd.UserID)
	}
	return fmt.Errorf("unknown command kind %q", cmd.Kind)
}

// accepted turns the bool the void-returning mutations report into the same
// divergence error every other command produces.
func accepted(ok bool, reason string) error {
	if ok {
		return nil
	}
	return errors.New(reason)
}

func short(hash string) string {
	if len(hash) > 12 {
		return hash[:12]
	}
	return hash
}
