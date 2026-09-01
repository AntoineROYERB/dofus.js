package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// DisconnectGrace is how long a player's character survives on the board after
// their connection drops. A reload or a brief network blip resumes it; going
// away for good forfeits the match.
const DisconnectGrace = 45 * time.Second

// Session is the identity behind a connection. It outlives the socket so that
// a client holding the token can come back as the same player.
type Session struct {
	Token  string
	UserID string
	Name   string

	// RoomID is the room this player belongs to, remembered across a drop.
	RoomID string
	// forfeit fires once the grace period expires with no reconnection.
	forfeit *time.Timer
}

// Sessions is the server's token store.
type Sessions struct {
	mu    sync.Mutex
	byTok map[string]*Session
}

func NewSessions() *Sessions {
	return &Sessions{byTok: make(map[string]*Session)}
}

// Create mints a new identity and its resume token.
func (s *Sessions) Create() (*Session, error) {
	token, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	userID, err := randomHex(8)
	if err != nil {
		return nil, err
	}

	sess := &Session{
		Token:  token,
		UserID: userID,
		Name:   "Guest-" + userID[len(userID)-6:],
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.byTok[token] = sess
	return sess, nil
}

// Resume returns the session behind a token, if the server still knows it.
func (s *Sessions) Resume(token string) (*Session, bool) {
	if token == "" {
		return nil, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.byTok[token]
	return sess, ok
}

func (s *Sessions) Drop(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, ok := s.byTok[token]; ok {
		sess.stopForfeit()
		delete(s.byTok, token)
	}
}

// startForfeit arms the grace timer. The callback only posts to a channel: the
// actual state change happens on the hub goroutine like every other mutation.
func (s *Sessions) startForfeit(sess *Session, notify chan<- Forfeit) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess.stopForfeit()
	target := Forfeit{Token: sess.Token, UserID: sess.UserID, RoomID: sess.RoomID}
	sess.forfeit = time.AfterFunc(DisconnectGrace, func() {
		select {
		case notify <- target:
		default: // hub is gone; nothing to clean up
		}
	})
}

func (s *Sessions) stopForfeit(sess *Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess.stopForfeit()
}

func (sess *Session) stopForfeit() {
	if sess.forfeit != nil {
		sess.forfeit.Stop()
		sess.forfeit = nil
	}
}

// Forfeit says a player never came back and should be dropped from their game.
type Forfeit struct {
	Token  string
	UserID string
	RoomID string
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
