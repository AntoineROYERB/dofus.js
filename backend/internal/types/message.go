package types

// BaseMessage carries the fields every message has. On inbound messages the
// server reads only MessageID, Timestamp and Type: UserID and UserName are
// deliberately absent from inbound payloads so that a client cannot claim an
// identity. Identity comes from the WebSocket connection, never from JSON.
type BaseMessage struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`
}

// ---------------------------------------------------------------------------
// Inbound: client -> server
// ---------------------------------------------------------------------------

type ChatMessageIn struct {
	BaseMessage
	Content string `json:"content"`
}

// CharacterAppearance is everything a client is allowed to choose about its
// character. Every stat (health, AP, MP) is assigned by the server.
type CharacterAppearance struct {
	Name   string `json:"name"`
	Color  string `json:"color"`
	Symbol string `json:"symbol"`
}

type CreateCharacterIn struct {
	BaseMessage
	Character CharacterAppearance `json:"character"`
}

type CharacterPositionedIn struct {
	BaseMessage
	Position Position `json:"position"`
}

type MoveIn struct {
	BaseMessage
	Position Position `json:"position"`
}

type EndTurnIn struct {
	BaseMessage
}

type CastSpellIn struct {
	BaseMessage
	SpellID        int      `json:"spellId"`
	TargetPosition Position `json:"targetPosition"`
}

type CreateRoomIn struct {
	BaseMessage
	Name string `json:"name"`
	// WithBot opens the room with a server-played opponent already in it, so a
	// lone visitor can play a whole match.
	WithBot bool `json:"withBot"`
}

type JoinRoomIn struct {
	BaseMessage
	RoomID string `json:"roomId"`
}

type LeaveRoomIn struct {
	BaseMessage
}

type PlayAgainIn struct {
	BaseMessage
}

type DisconnectIn struct {
	BaseMessage
}

// ---------------------------------------------------------------------------
// Outbound: server -> client
// ---------------------------------------------------------------------------

type ChatMessageOut struct {
	Type      string `json:"type"`
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Content   string `json:"content"`
}

type GameStateMessage struct {
	Type  string    `json:"type"`
	State GameState `json:"state"`
}

type GameOverMessage struct {
	Type   string `json:"type"`
	Winner string `json:"winner"`
}

// ActionRejected is sent to the single client whose action was refused, so a
// rejected move does not simply vanish into the server log.
type ActionRejected struct {
	Type      string `json:"type"`
	MessageID string `json:"messageId"`
	Action    string `json:"action"`
	Reason    string `json:"reason"`
}

type UserInitMessage struct {
	Type      string `json:"type"`
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	User      User   `json:"user"`
	// Token lets a client come back as the same player after a reload or a
	// dropped connection. Every reconnect used to mint a brand new identity,
	// so the player simply lost their character.
	Token   string `json:"token"`
	Resumed bool   `json:"resumed"`
}

// LobbyState lists the open rooms. Sent to clients that are not in a room.
type LobbyState struct {
	Type  string        `json:"type"`
	Rooms []RoomSummary `json:"rooms"`
}

// RoomJoined tells a client which room it is in, so the UI can switch to the
// board. RoomID is empty when the client has just left one.
type RoomJoined struct {
	Type     string `json:"type"`
	RoomID   string `json:"roomId"`
	RoomName string `json:"roomName"`
}
