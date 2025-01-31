// internal/websocket/handler.go
package websocket

import (
	"fmt"
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

// HandleWebSocket upgrades HTTP connections to WebSocket connections
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// 1. Upgrade HTTP to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading connection: %v", err)
		return
	}

	// 2. Create new client
	clientID := r.URL.Query().Get("id")
	if clientID == "" {
		clientID = fmt.Sprintf("user-%d", time.Now().UnixNano())
	}

	client := &Client{
		ID:   clientID,
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  h,
	}

	log.Printf("New WebSocket connection established for client %s", client.ID)

	// 3. Register client with hub
	client.Hub.Register <- client

	// 4. Start client routines
	// Start the read and write pumps in separate goroutines
	go client.WritePump()
	go client.ReadPump()
}
