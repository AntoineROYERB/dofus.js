import React, { useRef, useEffect } from "react";
import { useWebSocket } from "../../context/WebSocketContext";

export const ChatWindow: React.FC = () => {
  const { chatMessages, userId } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  let lastMessageId: string | null = null; // Variable pour mémoriser l'ID du dernier message affiché

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  return (
    <div className="w-full h-full border rounded-lg bg-white shadow-sm">
      <div className="overflow-y-auto p-4">
        {chatMessages.length === 0 ? (
          <div className="text-gray-400 text-center">No messages yet</div>
        ) : (
          chatMessages.map((msg, index) => {
            // Vérifie si l'ID du message est le même que celui du précédent
            if (msg.messageId === lastMessageId) {
              return null; // Ignore ce message
            }

            // Mémorise l'ID du message actuel
            lastMessageId = msg.messageId;

            return msg.type === "chat" ? (
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
            ) : null;
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
