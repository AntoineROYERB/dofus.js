import React, { useEffect, useRef, useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { ChatInput } from "./ChatInput";
import { useWebSocket } from "../../context/WebSocketContext";

const OPEN_KEY = "dofusjs.chatOpen";

const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The chat used to hold a sixth of the screen open at all times, covering the
 * corner of the board even when empty — and a starting cell could land
 * underneath it. It is now a row at the foot of the rail that opens on demand
 * and carries a count of what arrived while it was shut.
 */
export const Chat: React.FC = () => {
  const { chatMessages, connected, userName } = useWebSocket();
  const [open, setOpen] = useState(readOpen);
  const seen = useRef(chatMessages.length);

  useEffect(() => {
    if (open) seen.current = chatMessages.length;
  }, [open, chatMessages.length]);

  const unread = open ? 0 : Math.max(0, chatMessages.length - seen.current);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // Private browsing: the panel just starts closed next time.
    }
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-baseline gap-2.5 border-t border-ink py-2 text-left text-[12.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 flex-none translate-y-[-2px] rounded-full ${
            connected ? "bg-graphite" : "bg-vermilion"
          }`}
          title={connected ? `Connected as ${userName}` : "Disconnected"}
        />
        <span className="flex-1 text-ink">Chat</span>
        <span className="font-mono text-[11.5px] tabular-nums text-ink">
          {unread > 0 ? unread : ""}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          {open ? "hide" : "open"}
        </span>
      </button>

      {open && (
        <div className="flex h-[188px] flex-col">
          <div className="min-h-0 flex-1">
            <ChatWindow />
          </div>
          <ChatInput />
        </div>
      )}
    </div>
  );
};
