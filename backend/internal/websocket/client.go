// internal/websocket/client.go
package websocket

import (
	"encoding/json"
	"log"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID   string
	Conn *websocket.Conn
	Send chan []byte
	Hub  *Hub
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Error] Client %s: %v", c.ID, err)
			}
			break
		}

		var msg struct {
			Content string `json:"content"`
			Sender  string `json:"sender"`
			Type    string `json:"type"`
		}

		if err := json.Unmarshal(message, &msg); err == nil {
			log.Printf("[Received] From %s: %s", msg.Sender, msg.Content)
		}

		c.Hub.Broadcast <- message
	}
}

func (c *Client) WritePump() {
	defer c.Conn.Close()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			var msg struct {
				Content string `json:"content"`
				Sender  string `json:"sender"`
				Type    string `json:"type"`
			}

			if err := json.Unmarshal(message, &msg); err == nil {
				log.Printf("[Sent] To %s: %s from %s", c.ID, msg.Content, msg.Sender)
			}

			err := c.Conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("[Error] Writing to %s: %v", c.ID, err)
				return
			}
		}
	}
}
