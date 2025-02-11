import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { generateMessageId } from "../../providers/WebSocketProvider";
import { ChatMessage } from "../../types/message";

export const ChatInput: React.FC = () => {
  const [message, setMessage] = useState("");
  const { sendChatMessage, connected, userId, userName } = useWebSocket();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      const { messageId, timestamp } = generateMessageId();
      const chatMessage: ChatMessage = {
        type: "chat",
        userId,
        userName,
        timestamp,
        messageId,
        content: message.trim(),
      };
      sendChatMessage(chatMessage);
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!connected}
          placeholder={connected ? "Type a message..." : "Connecting..."}
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!connected || !message.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  );
};
