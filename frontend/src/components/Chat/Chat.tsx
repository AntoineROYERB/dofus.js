import React from "react";
import { ChatWindow } from "./ChatWindow";
import { ChatInput } from "./ChatInput";
import { ConnectionStatus } from "../ConnectionStatus";

export const Chat: React.FC = () => {
  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-2 flex flex-col">
      <div className="flex flex-col h-full">
        {/* Keep ConnectionStatus fixed at the top */}
        <ConnectionStatus />

        {/* Scrollable chat window */}
        <div className="flex-1 overflow-y-auto p-2">
          <ChatWindow />
        </div>

        <ChatInput />
      </div>
    </div>
  );
};
