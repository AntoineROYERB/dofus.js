// src/components/Chat/ChatWindow.tsx
import React, { useRef, useEffect } from "react";
import { useWebSocket } from "../../context/WebSocketContext";

export const ChatWindow: React.FC = () => {
  const { messages, userId } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div className="h-[400px] overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center">No messages yet</div>
        ) : (
          messages.map((msg, index) =>
            msg.type === "chat" ? (
              <div
                key={index}
                className={`mb-2 p-3 rounded-lg ${
                  msg.userId === userId
                    ? "bg-blue-100 ml-auto w-fit max-w-[80%]"
                    : "bg-gray-100 w-fit max-w-[80%]"
                }`}
              >
                <div className="text-xs text-gray-600 mb-1">{msg.userName}</div>
                <div className="break-words">{msg.content}</div>
              </div>
            ) : null
          )
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
