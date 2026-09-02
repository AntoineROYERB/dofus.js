import { useChatWindow } from "../../hooks/useChatWindow";
import { useWebSocket } from "../../context/WebSocketContext";

export const ChatWindow: React.FC = () => {
  const { chatMessages, userId } = useWebSocket();
  const { messagesEndRef } = useChatWindow(chatMessages);

  let lastMessageId: string | null = null;

  return (
    <div className="h-full overflow-y-auto pr-1">
      {chatMessages.length === 0 ? (
        <p className="py-2 text-[12.5px] text-muted">No messages yet.</p>
      ) : (
        chatMessages.map((msg, index) => {
          if (msg.messageId === lastMessageId) return null;
          lastMessageId = msg.messageId;
          if (msg.type !== "chat") return null;

          const mine = msg.userId === userId;

          return (
            <div
              key={index}
              className="border-t border-hairline py-[7px] text-[12.5px] leading-snug"
            >
              <span
                className={`mr-2 font-mono text-[9.5px] ${
                  mine ? "text-vermilion" : "text-muted"
                }`}
              >
                {mine ? "you" : msg.userName}
              </span>
              <span className="break-words text-graphite">{msg.content}</span>
            </div>
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
