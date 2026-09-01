package websocket

import (
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

// HandleWebSocket upgrades HTTP connections to WebSocket connections.
//
// A client may present a resume token as ?token=... to come back as the player
// it was before. Without one it gets a fresh identity. Either way the identity
// belongs to the connection for the rest of the session; there used to be an
// activeSessions map here, written from every HTTP goroutine without a lock,
// whose lookup could never hit because the id it checked had just been
// generated two lines above.
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	session, resumed := h.sessions.Resume(r.URL.Query().Get("token"))
	if !resumed {
		var err error
		session, err = h.sessions.Create()
		if err != nil {
			log.Printf("[Error] Creating session: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Error] Upgrading connection: %v", err)
		return
	}

	initMsg, err := json.Marshal(types.UserInitMessage{
		Type:      "user_init",
		MessageID: "init-" + session.UserID,
		Timestamp: time.Now().UnixMilli(),
		User:      types.User{ID: session.UserID, Name: session.Name},
		Token:     session.Token,
		Resumed:   resumed,
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
		ID:      session.UserID,
		Conn:    conn,
		Send:    make(chan []byte, 256),
		Hub:     h,
		Session: session,
	}

	if resumed {
		log.Printf("[Connection] %s resumed (%s)", session.UserID, session.Name)
	} else {
		log.Printf("[Connection] %s new (%s)", session.UserID, session.Name)
	}

	// Run() sends the newcomer its lobby or room state as part of registering
	// it. Doing that from here would race: the send can reach the client map
	// before Run() has finished adding this client to it.
	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
