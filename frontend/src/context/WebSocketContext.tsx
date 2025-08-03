import { createContext, useContext } from "react";
import { ChatMessage, GameStateMessage } from "../types/message";
import { GameAction } from "../types/game";

interface WebSocketContextType {
  chatMessages: ChatMessage[];
  // gameStatus: string;
  sendChatMessage: (message: ChatMessage) => void;
  sendGameAction: (action: GameAction) => void;
  connected: boolean;
  userId: string;
  userName: string;
  gameRecord: GameStateMessage[];
  winner: string | null;
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
