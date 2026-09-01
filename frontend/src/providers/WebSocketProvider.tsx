import React, { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketContext } from "../context/WebSocketContext";
import {
  ChatMessage,
  GameState,
  GameStateMessage,
  UserInitMessage,
  GameOverMessage,
  Message,
} from "../types/message";
import { GameAction } from "../types/game";

type WebSocketProviderProps = {
  children: React.ReactNode;
};

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [userId, setUserId] = useState<string>(
    () => localStorage.getItem("userId") || ""
  );
  const [userName, setUserName] = useState<string>(
    () => localStorage.getItem("userName") || ""
  );
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameRecord, setGameRecord] = useState<GameState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const handleGameStatesRecord = useCallback((data: GameStateMessage) => {
    setGameRecord((prev) => [...prev, data.state]);
  }, []);

  const handleChatMessage = useCallback(
    (data: ChatMessage | UserInitMessage | GameOverMessage) => {
      switch (data.type) {
        case "user_init":
          localStorage.setItem("userId", data.user.id);
          localStorage.setItem("userName", data.user.name);
          setUserId(data.user.id);
          setUserName(data.user.name);
          break;
        case "chat":
          setChatMessages((prev) => [...prev, data]);
          break;
        case "game_over":
          setWinner(data.winner);
          break;
      }
    },
    []
  );

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const isDev = import.meta.env.DEV;
      const wsUrl = isDev
        ? `ws://localhost:8080/ws`
        : `ws://${window.location.hostname}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const data: Message = JSON.parse(event.data);
          if (data.type === "game_state") {
            handleGameStatesRecord(data as GameStateMessage);
          } else {
            handleChatMessage(
              data as ChatMessage | UserInitMessage | GameOverMessage
            );
          }
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      };
      setSocket(ws);
      return ws;
    } catch (error) {
      console.error("[WebSocket] Connection error:", error);
    }
  }, [handleChatMessage, handleGameStatesRecord]);

  useEffect(() => {
    if (!wsRef.current) {
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "disconnect", userId }));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, userId]);

  const sendChatMessage = (chatMessage: ChatMessage) => {
    if (socket?.readyState === WebSocket.OPEN && userId) {
      socket.send(JSON.stringify(chatMessage));
    } else {
      console.warn(
        "[WebSocket] Cannot send message - not connected or no user ID"
      );
    }
  };

  const sendGameAction = (action: GameAction) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(action));
    } else {
      console.warn("[WebSocket] Cannot send game action - not connected");
    }
  };

  return (
    <WebSocketContext.Provider
      value={{
        chatMessages,
        sendChatMessage,
        sendGameAction,
        connected,
        userId,
        userName,
        gameRecord,
        winner,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
