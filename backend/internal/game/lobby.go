package game

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	mathrand "math/rand"
	"regexp"
	"sort"
	"sync"
	"time"

	"game-server/internal/types"
)

var (
	ErrRoomNotFound  = errors.New("that game no longer exists")
	ErrRoomFull      = errors.New("that game is full")
	ErrRoomStarted   = errors.New("that game has already started")
	ErrInvalidRoom   = errors.New("game name must be 3 to 24 letters, digits or spaces")
	ErrAlreadyInRoom = errors.New("you are already in a game")
	ErrNotInRoom     = errors.New("you are not in a game")
)

// MaxPlayersPerRoom keeps a room to a size the board and the turn order can
// actually accommodate. A room holds exactly a duel: with no "ready" step
// left, the fight has to start the moment the room is full, and that is only
// unambiguous when full and playable mean the same number.
const MaxPlayersPerRoom = MinPlayers

var roomNamePattern = regexp.MustCompile(`^[a-zA-Z0-9 ]{3,24}$`)

// Room is one game and the name players see in the list.
type Room struct {
	ID   string
	Name string
	Game *Game
}

// Lobby holds every room on the server. It replaces the single global game the
// hub used to own, which meant two visitors arriving separately landed in the
// same match and no one could start a second one.
type Lobby struct {
	mu           sync.RWMutex
	rooms        map[string]*Room
	turnDuration time.Duration
}

func NewLobby(turnDuration time.Duration) *Lobby {
	return &Lobby{rooms: make(map[string]*Room), turnDuration: turnDuration}
}

// Create opens a new room and returns it.
func (l *Lobby) Create(name string) (*Room, error) {
	if !roomNamePattern.MatchString(name) {
		return nil, ErrInvalidRoom
	}

	id, err := newRoomID()
	if err != nil {
		return nil, err
	}

	room := &Room{
		ID:   id,
		Name: name,
		Game: NewWithOptions(mathrand.New(mathrand.NewSource(time.Now().UnixNano())), l.turnDuration),
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	l.rooms[id] = room
	return room, nil
}

func (l *Lobby) Get(id string) (*Room, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	room, ok := l.rooms[id]
	return room, ok
}

// Remove closes a room. Callers do this once the last player has left.
func (l *Lobby) Remove(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.rooms, id)
}

// List summarises every open room, sorted by name so the lobby does not
// reshuffle itself on each update.
func (l *Lobby) List() []types.RoomSummary {
	l.mu.RLock()
	rooms := make([]*Room, 0, len(l.rooms))
	for _, room := range l.rooms {
		rooms = append(rooms, room)
	}
	l.mu.RUnlock()

	summaries := make([]types.RoomSummary, 0, len(rooms))
	for _, room := range rooms {
		summaries = append(summaries, types.RoomSummary{
			ID:         room.ID,
			Name:       room.Name,
			Players:    room.Game.PlayerCount(),
			MaxPlayers: MaxPlayersPerRoom,
			Status:     room.Game.Status(),
		})
	}
	sort.Slice(summaries, func(i, j int) bool {
		if summaries[i].Name != summaries[j].Name {
			return summaries[i].Name < summaries[j].Name
		}
		return summaries[i].ID < summaries[j].ID
	})
	return summaries
}

// CanJoin reports whether a newcomer may still enter this room.
func (r *Room) CanJoin() error {
	if r.Game.Status() != types.StatusCreatingPlayer {
		return ErrRoomStarted
	}
	if r.Game.PlayerCount() >= MaxPlayersPerRoom {
		return ErrRoomFull
	}
	return nil
}

func newRoomID() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
