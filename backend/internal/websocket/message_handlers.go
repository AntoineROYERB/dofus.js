package websocket

import (
	"encoding/json"
	"log"

	"game-server/internal/types"
)

// MessageHandler receives the connection the message arrived on. Every handler
// derives the acting player from that connection and ignores any identity the
// payload may claim.
type MessageHandler func(h *Hub, c *Client, data []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":                 handleChat,
	"create_character":     handleCreateCharacter,
	"disconnect":           handleDisconnect,
	"ready_to_start":       handleReadyToStart,
	"move":                 handleMove,
	"character_positioned": handleCharacterPositioned,
	"end_turn":             handleEndTurn,
	"cast_spell":           handleCastSpell,
}

// decode parses an inbound payload, reporting a malformed body back to the
// sender instead of dropping it silently.
func decode[T any](c *Client, action string, data []byte, out *T) bool {
	if err := json.Unmarshal(data, out); err != nil {
		log.Printf("[Error] Invalid %s message from %s: %v", action, c.ID, err)
		return false
	}
	return true
}

// broadcastState pushes the new snapshot, and the game over announcement when
// the action that just landed ended the game.
func (h *Hub) broadcastState() {
	if err := h.BroadcastGameState(); err != nil {
		log.Printf("[Error] Failed to broadcast game state: %v", err)
	}
	h.BroadcastGameOver()
}

func handleChat(h *Hub, c *Client, data []byte) {
	var in types.ChatMessageIn
	if !decode(c, "chat", data, &in) {
		return
	}
	if in.Content == "" {
		return
	}

	// Re-marshalled from the connection's identity rather than echoed back, so
	// a client cannot post under someone else's name.
	out, err := json.Marshal(types.ChatMessageOut{
		Type:      "chat",
		MessageID: in.MessageID,
		Timestamp: in.Timestamp,
		UserID:    c.ID,
		UserName:  c.User.Name,
		Content:   in.Content,
	})
	if err != nil {
		log.Printf("[Error] Failed to marshal chat message: %v", err)
		return
	}
	h.broadcastMessage(out)
}

func handleCreateCharacter(h *Hub, c *Client, data []byte) {
	var in types.CreateCharacterIn
	if !decode(c, "create_character", data, &in) {
		return
	}
	if err := h.game.AddPlayer(c.ID, c.User.Name, in.Character); err != nil {
		h.reject(c, "create_character", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleReadyToStart(h *Hub, c *Client, data []byte) {
	var in types.ReadyToStartIn
	if !decode(c, "ready_to_start", data, &in) {
		return
	}
	if err := h.game.SetReady(c.ID); err != nil {
		h.reject(c, "ready_to_start", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleCharacterPositioned(h *Hub, c *Client, data []byte) {
	var in types.CharacterPositionedIn
	if !decode(c, "character_positioned", data, &in) {
		return
	}
	if err := h.game.ChooseInitialPosition(c.ID, in.Position); err != nil {
		h.reject(c, "character_positioned", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleMove(h *Hub, c *Client, data []byte) {
	var in types.MoveIn
	if !decode(c, "move", data, &in) {
		return
	}
	if err := h.game.Move(c.ID, in.Position); err != nil {
		h.reject(c, "move", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleCastSpell(h *Hub, c *Client, data []byte) {
	var in types.CastSpellIn
	if !decode(c, "cast_spell", data, &in) {
		return
	}
	if err := h.game.CastSpell(c.ID, in.SpellID, in.TargetPosition); err != nil {
		h.reject(c, "cast_spell", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleEndTurn(h *Hub, c *Client, data []byte) {
	var in types.EndTurnIn
	if !decode(c, "end_turn", data, &in) {
		return
	}
	if err := h.game.EndTurn(c.ID); err != nil {
		h.reject(c, "end_turn", in.MessageID, err)
		return
	}
	h.broadcastState()
}

func handleDisconnect(h *Hub, c *Client, data []byte) {
	log.Printf("[Disconnect] %s left the game", c.User.Name)
	h.game.RemovePlayer(c.ID)
	h.broadcastState()
}
