package websocket

import (
	"encoding/json"
	"log"

	"game-server/internal/game"
	"game-server/internal/types"
)

// MessageHandler receives the connection the message arrived on. Every handler
// derives the acting player from that connection and ignores any identity the
// payload may claim.
type MessageHandler func(h *Hub, c *Client, data []byte)

var messageHandlers = map[string]MessageHandler{
	"chat":                 handleChat,
	"create_room":          handleCreateRoom,
	"join_room":            handleJoinRoom,
	"leave_room":           handleLeaveRoom,
	"create_character":     handleCreateCharacter,
	"character_positioned": handleCharacterPositioned,
	"move":                 handleMove,
	"cast_spell":           handleCastSpell,
	"end_turn":             handleEndTurn,
	"play_again":           handlePlayAgain,
}

func decode[T any](c *Client, action string, data []byte, out *T) bool {
	if err := json.Unmarshal(data, out); err != nil {
		log.Printf("[Error] Invalid %s message from %s: %v", action, c.ID, err)
		return false
	}
	return true
}

// inRoom resolves the caller's room, rejecting the action when they are still
// sitting in the lobby.
func (h *Hub) inRoom(c *Client, action, messageID string) (*game.Room, bool) {
	room, ok := h.currentRoom(c)
	if !ok {
		h.reject(c, action, messageID, game.ErrNotInRoom)
		return nil, false
	}
	return room, true
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

func handleCreateRoom(h *Hub, c *Client, data []byte) {
	var in types.CreateRoomIn
	if !decode(c, "create_room", data, &in) {
		return
	}
	if c.RoomID != "" {
		h.reject(c, "create_room", in.MessageID, game.ErrAlreadyInRoom)
		return
	}

	room, err := h.lobby.Create(in.Name)
	if err != nil {
		h.reject(c, "create_room", in.MessageID, err)
		return
	}

	if in.WithBot {
		if botID, err := room.Game.AddBot(); err != nil {
			log.Printf("[Warning] Could not add a bot to room %s: %v", room.ID, err)
		} else {
			log.Printf("[Room] %s: bot %s added", room.ID, botID)
		}
	}

	log.Printf("[Room] %s (%s) created by %s", room.ID, room.Name, c.ID)
	h.setRoom(c, room.ID)
	h.sendRoomJoined(c, room.ID, room.Name)
	h.broadcastGameState(room)
	h.broadcastLobby()
}

func handleJoinRoom(h *Hub, c *Client, data []byte) {
	var in types.JoinRoomIn
	if !decode(c, "join_room", data, &in) {
		return
	}
	if c.RoomID != "" {
		h.reject(c, "join_room", in.MessageID, game.ErrAlreadyInRoom)
		return
	}

	room, ok := h.lobby.Get(in.RoomID)
	if !ok {
		h.reject(c, "join_room", in.MessageID, game.ErrRoomNotFound)
		return
	}
	if err := room.CanJoin(); err != nil {
		h.reject(c, "join_room", in.MessageID, err)
		return
	}

	h.setRoom(c, room.ID)
	h.sendRoomJoined(c, room.ID, room.Name)
	h.broadcastGameState(room)
	h.broadcastLobby()
}

func handleLeaveRoom(h *Hub, c *Client, data []byte) {
	var in types.LeaveRoomIn
	if !decode(c, "leave_room", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "leave_room", in.MessageID)
	if !ok {
		return
	}

	room.Game.RemovePlayer(c.ID)
	h.setRoom(c, "")
	h.sendRoomJoined(c, "", "")

	if !h.closeRoomIfEmpty(room) {
		h.broadcastGameState(room)
	}
	h.sendLobby(c)
	h.broadcastLobby()
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

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
		UserName:  c.Session.Name,
		Content:   in.Content,
	})
	if err != nil {
		log.Printf("[Error] Failed to marshal chat message: %v", err)
		return
	}
	// Chat stays inside the room; clients in the lobby share the lobby channel.
	h.broadcastToRoom(c.RoomID, out)
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

func handleCreateCharacter(h *Hub, c *Client, data []byte) {
	var in types.CreateCharacterIn
	if !decode(c, "create_character", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "create_character", in.MessageID)
	if !ok {
		return
	}
	if room.Game.PlayerCount() >= game.MaxPlayersPerRoom && !room.Game.HasPlayer(c.ID) {
		h.reject(c, "create_character", in.MessageID, game.ErrRoomFull)
		return
	}
	if err := room.Game.AddPlayer(c.ID, c.Session.Name, in.Character); err != nil {
		h.reject(c, "create_character", in.MessageID, err)
		return
	}
	h.broadcastGameState(room)
	h.broadcastLobby()
}

func handleCharacterPositioned(h *Hub, c *Client, data []byte) {
	var in types.CharacterPositionedIn
	if !decode(c, "character_positioned", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "character_positioned", in.MessageID)
	if !ok {
		return
	}
	if err := room.Game.ChooseInitialPosition(c.ID, in.Position); err != nil {
		h.reject(c, "character_positioned", in.MessageID, err)
		return
	}
	h.broadcastGameState(room)
}

func handleMove(h *Hub, c *Client, data []byte) {
	var in types.MoveIn
	if !decode(c, "move", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "move", in.MessageID)
	if !ok {
		return
	}
	if err := room.Game.Move(c.ID, in.Position); err != nil {
		h.reject(c, "move", in.MessageID, err)
		return
	}
	h.broadcastGameState(room)
}

func handleCastSpell(h *Hub, c *Client, data []byte) {
	var in types.CastSpellIn
	if !decode(c, "cast_spell", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "cast_spell", in.MessageID)
	if !ok {
		return
	}
	if err := room.Game.CastSpell(c.ID, in.SpellID, in.TargetPosition); err != nil {
		h.reject(c, "cast_spell", in.MessageID, err)
		return
	}
	h.broadcastGameState(room)
}

func handleEndTurn(h *Hub, c *Client, data []byte) {
	var in types.EndTurnIn
	if !decode(c, "end_turn", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "end_turn", in.MessageID)
	if !ok {
		return
	}
	if err := room.Game.EndTurn(c.ID); err != nil {
		h.reject(c, "end_turn", in.MessageID, err)
		return
	}
	h.broadcastGameState(room)
}

// handlePlayAgain sets up a rematch in place. "Play again" used to reload the
// page, which reset nothing on the server: the finished game stayed finished.
func handlePlayAgain(h *Hub, c *Client, data []byte) {
	var in types.PlayAgainIn
	if !decode(c, "play_again", data, &in) {
		return
	}
	room, ok := h.inRoom(c, "play_again", in.MessageID)
	if !ok {
		return
	}
	if err := room.Game.Restart(); err != nil {
		h.reject(c, "play_again", in.MessageID, err)
		return
	}
	log.Printf("[Room] %s restarted by %s", room.ID, c.ID)
	h.broadcastGameState(room)
	h.broadcastLobby()
}
