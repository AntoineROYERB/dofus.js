import { createContext, useContext } from "react";
import { Message, GameState } from "../types/websocket";

interface WebSocketContextType {
  messages: Message[];
  gameState: GameState | null;
  sendMessage: (content: string) => void;
  sendGameAction: (action: string, position?: Position) => void;
  connected: boolean;
  clientId: string;
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
