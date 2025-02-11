package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"game-server/internal/types"
	"log"
	"net/http"
	"time"

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

func generateUniqueID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

var activeSessions = make(map[string]bool) // Structure pour stocker les sessions actives

// HandleWebSocket upgrades HTTP connections to WebSocket connections
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Error] Upgrading connection: %v", err)
		return
	}
	id := generateUniqueID()

	// Vérifier si l'utilisateur est déjà connecté
	if activeSessions[id] {
		log.Printf("[Info] User %s already initialized, skipping init message.", id)
		return
	}
	// Enregistrer la session active
	activeSessions[id] = true

	initUser := &types.User{
		ID:   id,
		Name: "Guest-" + id[len(id)-6:],
	}

	// Send initialization message
	initMsg, err := json.Marshal(map[string]interface{}{
		"type":       "user_init",
		"messageId":  "init-" + id,
		"Timestamp":  time.Now(),
		"user":       initUser,
		"gameStatus": "creating_player",
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

	log.Printf("[New Connection] Client %s (%s)", id, "Guest-"+id[len(id)-6:])

	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
