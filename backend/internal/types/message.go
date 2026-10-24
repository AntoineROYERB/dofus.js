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
// character. Every stat (health, AP, MP) is assigned by the server, from the
// loadout picked here.
type CharacterAppearance struct {
	Name   string `json:"name"`
	Color  string `json:"color"`
	Symbol string `json:"symbol"`
	// Loadout names the four items the character fights with. Left out, the
	// character gets the first champion's set, so a client that predates
	// loadouts still gets one.
	Loadout Loadout `json:"loadout,omitzero"`
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
	// BotChampion picks which champion the bot plays, in that champion's set.
	// Empty means the first champion in champions.json.
	BotChampion string `json:"botChampion,omitempty"`
	// BotMode is how that opponent behaves: "fight", the default, or "dummy",
	// which stands still and takes it. Anything else is refused.
	BotMode string `json:"botMode,omitempty"`
	// BotLevel is how well it fights: "easy", "normal" or "hard". Empty
	// leaves it to the island, which rises across the campaign.
	BotLevel string `json:"botLevel,omitempty"`
	// Boss makes it one of the rulers of the islands, by bestiary id, with
	// its own set and way of fighting. BotChampion is then left empty.
	Boss string `json:"boss,omitempty"`
	// Island is what the fight is played on, which decides its ground. Empty
	// is a plain arena; an island the catalogue does not know is refused.
	Island string `json:"island,omitempty"`
}

// WakeOpponentIn turns this room's standing opponent into a fighting one. It
// carries nothing: there is one room, and one thing to wake in it.
type WakeOpponentIn struct {
	BaseMessage
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

// Endless Dreams. A party is made, then climbs; every message here is about
// the caller's own run, which the server finds from the connection.

// DreamCreateIn opens a party with the caller as its leader.
type DreamCreateIn struct {
	BaseMessage
	Character CharacterAppearance `json:"character"`
}

// DreamJoinIn joins a party still gathering, by the code its leader shared.
type DreamJoinIn struct {
	BaseMessage
	Code      string              `json:"code"`
	Character CharacterAppearance `json:"character"`
}

// DreamResumeIn takes a member back into their run with the key they were
// given, after a reload or a server restart.
type DreamResumeIn struct {
	BaseMessage
	RunID string `json:"runId"`
	Key   string `json:"key"`
}

// DreamRoomIn names one of a floor's rooms: to point at it, or, for the
// leader, to enter it.
type DreamRoomIn struct {
	BaseMessage
	Room int `json:"room"`
}

// DreamBoonIn takes one of the boons offered.
type DreamBoonIn struct {
	BaseMessage
	Boon string `json:"boon"`
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
