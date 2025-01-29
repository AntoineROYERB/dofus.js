package main

import (
	"game-server/internal/websocket"
	"log"
	"net/http"
)

func main() {
	// Create a new hub instance
	hub := websocket.NewHub()

	// Start the hub
	go hub.Run()

	// Set up the WebSocket endpoint
	http.HandleFunc("/ws", hub.HandleWebSocket)

	// Configure CORS middleware
	corsMiddleware := func(handler http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			handler.ServeHTTP(w, r)
		})
	}

	// Create a new mux and apply CORS middleware
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.HandleWebSocket)

	// Start the server
	log.Printf("Starting server on :8080")
	err := http.ListenAndServe(":8080", corsMiddleware(mux))
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
