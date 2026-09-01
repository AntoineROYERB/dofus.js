package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"game-server/internal/types"

	"github.com/gorilla/websocket"
)

// Configure the upgrader
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins for development
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func generateUniqueID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// HandleWebSocket upgrades HTTP connections to WebSocket connections.
//
// The connection's generated ID is the player's identity for the rest of the
// session. There used to be an activeSessions map here, written from every
// HTTP goroutine without a lock; its lookup could never hit, since the ID it
// checked had just been generated two lines above.
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	id, err := generateUniqueID()
	if err != nil {
		log.Printf("[Error] Generating client ID: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Error] Upgrading connection: %v", err)
		return
	}

	initUser := &types.User{
		ID:   id,
		Name: "Guest-" + id[len(id)-6:],
	}

	initMsg, err := json.Marshal(types.UserInitMessage{
		Type:      "user_init",
		MessageID: "init-" + id,
		Timestamp: time.Now().UnixMilli(),
		User:      *initUser,
	})
	if err != nil {
		log.Printf("[Error] Marshaling init message: %v", err)
		conn.Close()
		return
	}

	if err := conn.WriteMessage(websocket.TextMessage, initMsg); err != nil {
		log.Printf("[Error] Sending init message: %v", err)
		conn.Close()
		return
	}

	client := &Client{
		ID:   id,
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  h,
		User: initUser,
	}

	log.Printf("[New Connection] Client %s (%s)", id, initUser.Name)

	// Run() sends the newcomer the current state as part of registering it.
	// Broadcasting from here instead would race: the send can reach the client
	// map before Run() has finished adding this client to it.
	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
