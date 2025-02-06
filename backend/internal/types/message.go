package types

// const (
// 	MessageTypeChat       = "chat"
// 	MessageTypeGameAction = "game_action"
// 	MessageTypeGameState  = "game_state"

// 	GameActionCreateCharacter = "create_character"
// 	GameActionStartGame       = "start_game"
// 	GameActionEndTurn         = "end_turn"
// 	GameActionMove            = "move"
// )

type Message interface {
	GetType() string
}

func (bm BaseMessage) GetType() string {
	return bm.Type
}

type BaseMessage struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp"`
	UserID    string `json:"userId,omitempty"`
	Type      string `json:"type"`
}

type ChatMessage struct {
	BaseMessage
	Type    string `json:"type"`
	Content string `json:"content"`
}

type CreateCharacter struct {
	BaseMessage
	Type    string `json:"type"`
	Content string `json:"content"`
}

type GameActionMessage struct {
	BaseMessage
	Type      string     `json:"type"`
	Action    string     `json:"action"`
	PlayerID  string     `json:"playerId"`
	Position  *Position  `json:"position,omitempty"`
	Character *Character `json:"character,omitempty"`
}

type GameStateMessage struct {
	BaseMessage
	Type  string    `json:"type"`
	State GameState `json:"state"`
}
