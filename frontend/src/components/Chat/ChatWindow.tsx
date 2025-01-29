import React, { useRef, useEffect } from "react";
import { useWebSocket } from "../../context/WebSocketContext";

export const ChatWindow: React.FC = () => {
  const { messages, clientId } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div className="h-[400px] overflow-y-auto p-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 p-3 rounded-lg ${
              msg.sender === clientId
                ? "bg-blue-100 ml-auto w-fit max-w-[80%]"
                : "bg-gray-100 w-fit max-w-[80%]"
            }`}
          >
            <div className="text-xs text-gray-600 mb-1">{msg.sender}</div>
            <div className="break-words">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
