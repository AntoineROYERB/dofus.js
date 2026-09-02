import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { generateMessageId } from "../../utils/messageUtils";
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
    <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={!connected}
        placeholder={connected ? "Type a message…" : "Connecting…"}
        className="min-w-0 flex-1 border border-rule bg-board px-2 py-1.5 text-[12.5px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <button
        type="submit"
        disabled={!connected || !message.trim()}
        className="flex-none border border-ink bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-paper transition-colors disabled:border-hairline disabled:bg-transparent disabled:text-muted"
      >
        Send
      </button>
    </form>
  );
};
