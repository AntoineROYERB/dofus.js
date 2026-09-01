import { createContext, useContext } from "react";
import { ChatMessage, GameState, RoomSummary } from "../types/message";
import { GameAction } from "../types/game";

interface WebSocketContextType {
  chatMessages: ChatMessage[];
  sendChatMessage: (message: ChatMessage) => void;
  sendGameAction: (action: GameAction) => void;
  connected: boolean;
  userId: string;
  userName: string;
  /** The latest authoritative snapshot, or null while in the lobby. */
  gameState: GameState | null;
  /** Open rooms, refreshed while this client sits in the lobby. */
  rooms: RoomSummary[];
  roomId: string;
  roomName: string;
  winner: string | null;
  /** Last action the server refused, with the moment it arrived so repeats re-show. */
  rejection: { reason: string; at: number } | null;
}

export const WebSocketContext = createContext<WebSocketContextType | null>(
  null
);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
