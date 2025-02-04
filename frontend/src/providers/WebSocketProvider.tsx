// src/providers/WebSocketProvider.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketContext } from "../context/WebSocketContext";
import { ChatMessage, Message, UserInitMessage } from "../types/message";
import { GameState } from "../types/game";

type WebSocketProviderProps = {
  children: React.ReactNode;
};

export const generateMessageId = () => {
  const timestamp = Date.now();
  const messageId = `${timestamp}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  return { messageId, timestamp };
};

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const processedMessageIds = useRef(new Set<string>());

  const markMessageAsProcessed = (messageId: string) => {
    processedMessageIds.current.add(messageId);
  };

  const handleMessage = useCallback((data: Message | UserInitMessage) => {
    console.log("[WebSocket] Processing message:", data);
    if (data.type === "user_init") {
      setUserId(data.userId);
      setUserName(data.userName);
      return;
    }
    // Check if message has an ID and hasn't been processed
    if (!data.messageId || processedMessageIds.current.has(data.messageId)) {
      return;
    }

    // Mark message as processed
    markMessageAsProcessed(data.messageId);

    switch (data.type) {
      case "chat":
        setMessages((prev) => [...prev, data]);
        break;
      case "game_state":
        setGameState(data.state);
        break;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WebSocket] Already connected");
      return wsRef.current;
    }

    try {
      console.log("[WebSocket] Connecting...");
      const ws = new WebSocket(`ws://localhost:8080/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onclose = () => {
        console.log("[WebSocket] Connection closed");
        setConnected(false);
        wsRef.current = null;

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
          const data = JSON.parse(event.data);
          handleMessage(data);
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
  }, [handleMessage]);

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

  const sendChatMessage = (content: string) => {
    if (socket?.readyState === WebSocket.OPEN && userId) {
      const { messageId, timestamp } = generateMessageId();
      const message: ChatMessage = {
        userId: userId,
        messageId,
        timestamp,
        userName,
        type: "chat",
        content: content,
      };

      console.log("[WebSocket] Sending message:", message);
      socket.send(JSON.stringify(message));
    } else {
      console.warn(
        "[WebSocket] Cannot send message - not connected or no user ID"
      );
    }
  };

  const sendGameAction = (action: any) => {
    if (socket?.readyState === WebSocket.OPEN) {
      const messageId = generateMessageId();
      const message = {
        type: "game_action",
        timestamp: Date.now(),
        messageId,
        ...action,
      };
      console.log("[WebSocket] Sending game action:", message);
      socket.send(JSON.stringify(message));
    } else {
      console.warn("[WebSocket] Cannot send game action - not connected");
    }
  };

  return (
    <WebSocketContext.Provider
      value={{
        messages,
        gameState,
        sendChatMessage,
        sendGameAction,
        connected,
        userId,
        userName,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
