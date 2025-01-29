import { createContext, useContext } from "react";

interface WebSocketContextType {
  messages: Message[];
  sendMessage: (message: Omit<Message, "sender">) => void;
  connected: boolean;
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
