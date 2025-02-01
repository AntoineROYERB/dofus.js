// src/App.tsx
import React from "react";
import { WebSocketProvider } from "./providers/WebSocketProvider";
import { Chat } from "./components/Chat/Chat";
import { GameBoard } from "./components/Game/GameBoard";

function App() {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-bold mb-4">Game Board</h2>
            <GameBoard />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-4">Chat</h2>
            <Chat />
          </div>
        </div>
      </div>
    </WebSocketProvider>
  );
}

export default App;
