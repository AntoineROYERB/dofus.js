import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";

// Available colors for players
const PLAYER_COLORS = [
  "red",
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "teal",
  "indigo",
];

export const GameBoard: React.FC = () => {
  const { userId, userName, connected, gameState, sendGameAction } =
    useWebSocket();

  // Local state for character creation
  const [characterName, setCharacterName] = useState(
    `Player ${userId.slice(0, 4)}`
  );
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);

  // Game state checks
  const isMyTurn = gameState?.currentTurn === userId;
  const currentPlayer = gameState?.players?.[userId];
  const gameStatus = gameState?.status || "waiting";

  const gridSize = 10;

  const handleCreateCharacter = () => {
    sendGameAction({
      type: "create_character",
      userId,
      userName,
      character: {
        name: characterName,
        color: selectedColor,
        symbol: characterName ? characterName[0].toUpperCase() : "P",
      },
    });
  };

  // Handle game actions
  const handleStartGame = () => {
    console.log("Attempting to start game...");
    sendGameAction({
      type: "start_game",
      userId,
    });
  };

  const handleEndTurn = () => {
    sendGameAction({
      type: "end_turn",
      userId,
    });
  };

  // Handle cell click
  const handleCellClick = (index: number) => {
    if (!isMyTurn || gameStatus !== "playing") return;

    const x = index % gridSize;
    const y = Math.floor(index / gridSize);

    sendGameAction({
      type: "move",
      userId,
      position: { x, y },
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      {/* Character Creation */}
      {!currentPlayer && (
        <div className="mb-4 p-4 border rounded-lg">
          <h3 className="text-lg font-bold mb-4">Create Your Character</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Character Name:
              </label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter character name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Choose Color:
              </label>
              <div className="flex gap-2 flex-wrap">
                {PLAYER_COLORS.map((color) => (
                  <div
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`
                      w-8 h-8 rounded-full cursor-pointer
                      ${
                        color === selectedColor
                          ? "ring-2 ring-offset-2 ring-black"
                          : ""
                      }
                    `}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateCharacter}
              className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Create Character
            </button>
          </div>
        </div>
      )}

      {/* Game Status */}
      {currentPlayer && (
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: currentPlayer.character.color }}
            />
            <span className="font-medium">{currentPlayer.character.name}</span>
            <span
              className={`ml-2 inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </div>
          {gameState && (
            <span className="text-sm">
              Turn: {gameState.turnNumber}
              {isMyTurn && (
                <span className="ml-2 text-green-500 font-bold">
                  Your Turn!
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Player Stats */}
      {currentPlayer && (
        <div className="mb-4 text-sm">
          <div className="flex justify-between">
            <span>AP: {currentPlayer.actionPoints}</span>
            <span>MP: {currentPlayer.movementPoints}</span>
          </div>
        </div>
      )}

      {/* Game Grid */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, index) => (
          <div
            key={index}
            onClick={() => handleCellClick(index)}
            className={`
              w-full pt-[100%] relative 
              ${
                isMyTurn
                  ? "cursor-pointer hover:bg-blue-100"
                  : "cursor-not-allowed"
              }
              bg-gray-100
              transition-colors border border-gray-200
              ${isMyTurn ? "hover:border-blue-400" : ""}
            `}
          >
            {gameState?.players &&
              Object.values(gameState.players).map((player, i) => {
                if (
                  player.position?.x === index % gridSize &&
                  player.position?.y === Math.floor(index / gridSize)
                ) {
                  return (
                    <div
                      key={i}
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: player.character.color }}
                    >
                      <span
                        className={`
                      text-white text-xs font-bold
                      ${player.isCurrentTurn ? "ring-2 ring-white" : ""}
                    `}
                      >
                        {player.character.symbol}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
          </div>
        ))}
      </div>

      {/* Game Controls */}
      <div className="mt-4 flex justify-between">
        {currentPlayer && gameStatus === "waiting" && (
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
            disabled={!connected}
            onClick={handleStartGame}
          >
            Start Game
          </button>
        )}
        {gameStatus === "playing" && (
          <button
            className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300 hover:bg-red-600"
            disabled={!isMyTurn}
            onClick={handleEndTurn}
          >
            End Turn
          </button>
        )}
      </div>
    </div>
  );
};
