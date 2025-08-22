import React, { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "../../context/WebSocketContext";

export const ChatWindow: React.FC = () => {
  const { chatMessages, userId } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200); // Initial height
  let lastMessageId: string | null = null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent<HTMLDivElement>) => {
    const startY = mouseDownEvent.clientY;
    const startHeight = chatWindowRef.current?.offsetHeight || height;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newHeight = startHeight - (mouseMoveEvent.clientY - startY);
      setHeight(newHeight > 100 ? newHeight : 100); // Set a minimum height
    };

    const stopDrag = () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  }, [height]);

  return (
    <div
      ref={chatWindowRef}
      style={{ height: `${height}px` }}
      className="relative w-full border rounded-lg bg-white shadow-sm overflow-hidden"
    >
      <div
        onMouseDown={startResizing}
        className="absolute top-0 right-0 w-4 h-4 cursor-ns-resize bg-gray-400 hover:bg-gray-500 transition-colors"
        title="Resize"
      />
      <div className="h-full overflow-y-auto p-4">
        {chatMessages.length === 0 ? (
          <div className="text-gray-500 text-center">No messages yet</div>
        ) : (
          chatMessages.map((msg, index) => {
            if (msg.messageId === lastMessageId) {
              return null;
            }
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
                <div className="text-xs text-gray-800 mb-1">{msg.userName}</div>
                <div className="break-words text-black">{msg.content}</div>
              </div>
            ) : null;
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};