import React from "react";
import { Message } from "../../types/websocket";

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isSystem = message.type === "system";

  return (
    <div
      className={`mb-2 p-3 rounded-lg ${
        isSystem
          ? "bg-gray-100 text-gray-600 italic"
          : "bg-blue-100 border border-blue-200"
      }`}
    >
      {!isSystem && (
        <div className="font-bold text-blue-800 mb-1">{message.sender}</div>
      )}
      <div>{message.content}</div>
    </div>
  );
};
