// src/providers/WebSocketProvider.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketContext } from "../context/WebSocketContext";
import { Message } from "../types/websocket";

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
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    // 1. Create WebSocket connection
    const ws = new WebSocket(`ws://localhost:8080/ws?id=${clientId}`);
    wsRef.current = ws;

    // 2. Set up event handlers
    ws.onopen = () => {
      setConnected(true);
      console.log(`[WebSocket] Connected as ${clientId}`);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      console.log("[WebSocket] Disconnected");
    };

    ws.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        console.log("[WebSocket] Received message:", message);
        // Only add messages from others (our own messages are added in sendMessage)
        if (message.sender !== clientId) {
          setMessages((prev) => [...prev, message]);
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    };

    setSocket(ws);
    return ws;
  }, [clientId]);

  useEffect(() => {
    const ws = connectWebSocket();
    return () => {
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

      // Add our message to local state immediately
      setMessages((prev) => [...prev, message]);

      // Send to server
      socket.send(JSON.stringify(message));
      console.log("[WebSocket] Sent message:", message);
    }
  };

  return (
    <WebSocketContext.Provider
      value={{ messages, sendMessage, connected, clientId }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};
