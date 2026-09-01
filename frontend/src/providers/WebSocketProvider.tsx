import React, { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketContext } from "../context/WebSocketContext";
import { ChatMessage, GameState, Message, RoomSummary } from "../types/message";
import { GameAction } from "../types/game";

type WebSocketProviderProps = {
  children: React.ReactNode;
};

const TOKEN_KEY = "dofusjs.sessionToken";
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;

/**
 * The server sits behind the same origin as the page, so the scheme has to
 * follow it. Hardcoding ws:// meant the browser blocked the connection as soon
 * as the page was served over HTTPS.
 */
const socketUrl = (): string => {
  const token = localStorage.getItem(TOKEN_KEY) ?? "";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";

  if (import.meta.env.DEV) {
    return `ws://localhost:8080/ws${query}`;
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/ws${query}`;
};

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [connected, setConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [winner, setWinner] = useState<string | null>(null);
  const [rejection, setRejection] = useState<{
    reason: string;
    at: number;
  } | null>(null);

  // Only the latest snapshot is kept. Every state the server ever sent used to
  // pile up in an array that was copied on each message.
  const [gameState, setGameState] = useState<GameState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const closedByUs = useRef(false);

  const handleMessage = useCallback((data: Message) => {
    switch (data.type) {
      case "user_init":
        // The token is what lets a reload or a dropped connection come back as
        // the same player instead of as a brand new guest.
        localStorage.setItem(TOKEN_KEY, data.token);
        setUserId(data.user.id);
        setUserName(data.user.name);
        break;
      case "lobby_state":
        setRooms(data.rooms);
        break;
      case "room_joined":
        setRoomId(data.roomId);
        setRoomName(data.roomName);
        if (!data.roomId) {
          setGameState(null);
          setWinner(null);
        }
        break;
      case "game_state":
        setGameState(data.state);
        // A rematch clears the previous result without a page reload.
        if (data.state.status !== "game_over") {
          setWinner(null);
        }
        break;
      case "chat":
        setChatMessages((prev) => [...prev.slice(-199), data]);
        break;
      case "game_over":
        setWinner(data.winner);
        break;
      case "action_rejected":
        // Surface the server's reason rather than leaving the player waiting
        // for a state update that is never coming.
        setRejection({ reason: data.reason, at: Date.now() });
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(socketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      attempts.current = 0;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data) as Message);
      } catch (error) {
        console.error("[WebSocket] Malformed message", error);
      }
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (closedByUs.current) return;

      // Exponential backoff with jitter. A flat 2s retry hammered the server
      // for as long as it stayed down.
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attempts.current,
        RECONNECT_MAX_MS
      );
      attempts.current += 1;
      reconnectTimer.current = setTimeout(connect, delay + Math.random() * 250);
    };
  }, [handleMessage]);

  useEffect(() => {
    closedByUs.current = false;
    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendChatMessage = useCallback(
    (chatMessage: ChatMessage) => {
      send(chatMessage);
    },
    [send]
  );

  const sendGameAction = useCallback(
    (action: GameAction) => {
      send(action);
    },
    [send]
  );

  return (
    <WebSocketContext.Provider
      value={{
        chatMessages,
        sendChatMessage,
        sendGameAction,
        connected,
        userId,
        userName,
        gameState,
        rooms,
        roomId,
        roomName,
        winner,
        rejection,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
