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

type IsReadyMessage struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	UserID    string `json:"userId"`
}

type MoveMessage struct {
	MessageID string   `json:"messageId"`
	UserID    string   `json:"userId"`
	Position  Position `json:"position"`
}

type GameStateMessage struct {
	BaseMessage
	State GameState `json:"state"`
}

type DisconnectMessage struct {
	BaseMessage
}

type CharacterPositionedMessage struct {
	BaseMessage
	Position Position `json:"position"`
	UserID   string   `json:"userId"`
}
