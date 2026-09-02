import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ChatWindow } from "./ChatWindow";
import { ChatInput } from "./ChatInput";
import { ConnectionStatus } from "../ConnectionStatus";

const COLLAPSED_KEY = "dofusjs.chatCollapsed";

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

export const Chat: React.FC = () => {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Private browsing: the panel just reopens next time.
    }
  };

  return (
    <div className="pointer-events-auto bg-gray-800/80 backdrop-blur-sm rounded-lg p-2 flex flex-col">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <ConnectionStatus />
          </div>
          {/*
            The panel covers the bottom-left of the board, and a starting cell
            can land underneath it — which would leave a player unable to place
            their character at all. Folding it away clears the board.
          */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show chat" : "Hide chat"}
            title={collapsed ? "Show chat" : "Hide chat, to uncover the board"}
            className="flex-none p-1 rounded text-gray-300 hover:text-white hover:bg-white/10 transition"
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              <ChatWindow />
            </div>
            <ChatInput />
          </>
        )}
      </div>
    </div>
  );
};
