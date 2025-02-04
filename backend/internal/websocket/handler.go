package websocket

import (
	"encoding/json"
	"log"
	"net/http"

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

// HandleWebSocket upgrades HTTP connections to WebSocket connections
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Configure upgrader to allow any origin
	upgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading connection: %v", err)
		return
	}

	// Create new user
	user := h.userManager.CreateGuestUser()

	initMsg, _ := json.Marshal(map[string]interface{}{
		"type":     "user_init",
		"userId":   user.ID,
		"userName": user.Name,
	})

	conn.WriteMessage(websocket.TextMessage, initMsg)

	client := &Client{
		ID:   user.ID,
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  h,
		User: user,
	}

	log.Printf("[Debug] New WebSocket connection established for client %s", client.ID)

	// Register the client before starting the pumps
	h.Register <- client

	// Start the pumps in separate goroutines
	go client.WritePump()
	go client.ReadPump()
}
