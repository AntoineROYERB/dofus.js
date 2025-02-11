package types

type BaseMessage struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	UserName  string `json:"userName"`
	UserID    string `json:"userId"`
	Type      string `json:"type"`
}

type ChatMessage struct {
	BaseMessage
	Content string `json:"content"`
}

type CreateCharacter struct {
	BaseMessage
	Character *Character `json:"character,omitempty"`
}

type GameActionMessage struct {
	BaseMessage
	Action    string     `json:"action"`
	PlayerID  string     `json:"playerId"`
	Position  *Position  `json:"position,omitempty"`
	Character *Character `json:"character,omitempty"`
}

type GameStateMessage struct {
	BaseMessage
	State GameState `json:"state"`
}
