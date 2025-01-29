package models

// Message represents the structure of messages sent between clients
// This includes system messages and user messages
type Message struct {
	Type    string `json:"type"`    // Type of message (e.g., "system", "chat", "game")
	Sender  string `json:"sender"`  // ID of the sending client
	Content string `json:"content"` // Actual message content
}
