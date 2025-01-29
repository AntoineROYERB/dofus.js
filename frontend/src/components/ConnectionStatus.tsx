import React from "react";
import { useWebSocket } from "../context/WebSocketContext";

export const ConnectionStatus: React.FC = () => {
  const { connected } = useWebSocket();

  return (
    <div
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
        connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      <div
        className={`w-2 h-2 rounded-full mr-2 ${
          connected ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {connected ? "Connected" : "Disconnected"}
    </div>
  );
};
