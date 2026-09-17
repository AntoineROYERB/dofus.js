// internal/websocket/client.go
package websocket

import (
	"log/slog"
	"time"

	"game-server/internal/metrics"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID   string
	Conn *websocket.Conn
	Send chan []byte
	Hub  *Hub

	// Session survives this socket, so a reconnecting client comes back as the
	// same player rather than as a brand new guest.
	Session *Session
	// RoomID scopes every broadcast this client takes part in. Only the hub
	// goroutine writes it.
	RoomID string
}

// Inbound pairs a payload with the connection it arrived on. ReadPump used to
// push the raw bytes into the hub and drop the client reference, which left
// every handler trusting the userId written inside the JSON. Identity now
// travels with the message and can never be spoofed by a client.
type Inbound struct {
	Client *Client
	Data   []byte
}

const (
	writeWait  = 10 * time.Second    // Time allowed to write a message to the peer.
	pongWait   = 60 * time.Second    // Time allowed to read the next pong message from the peer.
	pingPeriod = (pongWait * 9) / 10 // Send pings to peer with this period. Must be less than pongWait.
	// Chat lines and game actions are small, but 512 bytes was tight enough
	// that a long chat message silently closed the connection.
	maxMessageSize = 8192
)

// ReadPump pumps messages from the websocket connection to the hub.
//
// The application runs readPump in a per-connection goroutine. The application
// ensures that there is at most one reader on a connection by executing all
// reads from this goroutine.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("read failed", "component", "client", "user_id", c.ID, "error", err)
			}
			break
		}
		c.Hub.Inbound <- Inbound{Client: c, Data: message}
	}
}

// Trysend delivers a message to this client only, dropping it if the client's
// buffer is full rather than blocking the hub.
func (c *Client) TrySend(message []byte) {
	select {
	case c.Send <- message:
	default:
		metrics.ClientSendDropped.Inc()
		slog.Warn("dropped message, send buffer full", "component", "client", "user_id", c.ID)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
