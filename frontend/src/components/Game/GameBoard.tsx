// src/components/Game/GameBoard.tsx
import React from "react";
import { useWebSocket } from "../../context/WebSocketContext";

export const GameBoard: React.FC = () => {
  const { clientId, connected } = useWebSocket();

  // Example grid size
  const gridSize = 10;

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="mb-4">
        <span className="text-sm font-medium">
          Player ID: {clientId}
          <span
            className={`ml-2 inline-block w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          ></span>
        </span>
      </div>

      {/* Game grid */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, index) => (
          <div
            key={index}
            className="w-full pt-[100%] relative bg-gray-100 hover:bg-blue-100 transition-colors cursor-pointer border border-gray-200"
          ></div>
        ))}
      </div>

      {/* Game controls */}
      <div className="mt-4 flex justify-between">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          disabled={!connected}
        >
          Start Game
        </button>
        <button
          className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300"
          disabled={!connected}
        >
          End Turn
        </button>
      </div>
    </div>
  );
};
