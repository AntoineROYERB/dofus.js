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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

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
          console.log("[WebSocket] Message received:", event.data);
          const message = JSON.parse(event.data);
          setMessages((prev) => [...prev, message]);
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
      value={{ messages, sendMessage, connected, clientId }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
