import { createContext, useContext } from "react";
import { Message } from "../types/message";
import { GameState, GameAction } from "../types/game";

interface WebSocketContextType {
  messages: Message[];
  gameState: GameState | null;
  sendChatMessage: (content: string) => void;
  sendGameAction: (action: GameAction) => void;
  connected: boolean;
  userId: string;
  userName: string;
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
