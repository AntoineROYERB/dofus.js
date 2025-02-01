// src/providers/WebSocketProvider.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketContext } from "../context/WebSocketContext";
import { Message, GameState, Position } from "../types/websocket"; // Added missing imports

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [clientId] = useState(`User-${Math.floor(Math.random() * 1000)}`);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Move sendGameAction outside of connectWebSocket
  const sendGameAction = (action: string, position?: Position) => {
    if (socket?.readyState === WebSocket.OPEN) {
      const message = {
        type: "game_action",
        action,
        playerId: clientId,
        position,
      };
      socket.send(JSON.stringify(message));
    } else {
      console.warn("[WebSocket] Cannot send game action - not connected");
    }
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WebSocket] Already connected");
      return wsRef.current;
    }

    try {
      console.log("[WebSocket] Connecting...");
      const ws = new WebSocket(`ws://localhost:8080/ws?id=${clientId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected as ${clientId}`);
        setConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onclose = () => {
        console.log("[WebSocket] Connection closed");
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("[WebSocket] Attempting to reconnect...");
          connectWebSocket();
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("[WebSocket] Message received:", message);

          switch (message.type) {
            case "chat":
              setMessages((prev) => [...prev, message]);
              break;
            case "game_state":
              setGameState(message.state);
              break;
          }
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      };

      setSocket(ws);
      return ws;
    } catch (error) {
      console.error("[WebSocket] Connection error:", error);
      return null;
    }
  }, [clientId]);

  useEffect(() => {
    const ws = connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws?.readyState === WebSocket.OPEN) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  const sendMessage = (content: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      const message = {
        type: "chat",
        sender: clientId,
        content: content,
      };
      socket.send(JSON.stringify(message));
      setMessages((prev) => [...prev, message]);
    } else {
      console.warn("[WebSocket] Cannot send message - not connected");
    }
  };

  return (
    <WebSocketContext.Provider
      value={{
        messages,
        gameState,
        sendMessage,
        sendGameAction,
        connected,
        clientId,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
