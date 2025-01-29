import React from "react";
import { ChatWindow } from "./ChatWindow";
import { ChatInput } from "./ChatInput";
import { ConnectionStatus } from "../ConnectionStatus";
import { useWebSocket } from "../../context/WebSocketContext";

export const Chat: React.FC = () => {
  const { clientId } = useWebSocket();

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">Chat Room</h2>
          <p className="text-sm text-gray-600">Logged in as: {clientId}</p>
        </div>
        <ConnectionStatus />
      </div>
      <ChatWindow />
      <ChatInput />
    </div>
  );
};
