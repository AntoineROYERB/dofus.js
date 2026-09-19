package websocket

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"game-server/internal/metrics"
	"game-server/internal/types"

	"github.com/gorilla/websocket"
)

// HandleWebSocket upgrades HTTP connections to WebSocket connections.
//
// A client may present a resume token as ?token=... to come back as the player
// it was before. Without one it gets a fresh identity. Either way the identity
// belongs to the connection for the rest of the session; there used to be an
// activeSessions map here, written from every HTTP goroutine without a lock,
// whose lookup could never hit because the id it checked had just been
// generated two lines above.
// Sessions exposes the hub's session store so internal/auth can link a
// browser's existing resume-token session to a Google account after
// sign-in, without owning a second identity store.
func (h *Hub) Sessions() *Sessions {
	return h.sessions
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	session, resumed := h.sessions.Resume(r.URL.Query().Get("token"))
	if !resumed {
		var err error
		session, err = h.sessions.Create()
		if err != nil {
			slog.Error("failed to create session", "component", "handler", "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	metrics.Reconnects.WithLabelValues(strconv.FormatBool(resumed)).Inc()

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("failed to upgrade connection", "component", "handler", "error", err)
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
		slog.Error("failed to marshal init message", "component", "handler", "user_id", session.UserID, "error", err)
		conn.Close()
		return
	}

	if err := conn.WriteMessage(websocket.TextMessage, initMsg); err != nil {
		slog.Error("failed to send init message", "component", "handler", "user_id", session.UserID, "error", err)
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

	slog.Info("connection upgraded", "component", "handler", "user_id", session.UserID, "user_name", session.Name, "resumed", resumed)

	// Run() sends the newcomer its lobby or room state as part of registering
	// it. Doing that from here would race: the send can reach the client map
	// before Run() has finished adding this client to it.
	h.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
