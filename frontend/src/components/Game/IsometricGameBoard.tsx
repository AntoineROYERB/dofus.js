import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { GameStatus, Position, GAME_STATUS } from "../../types/game";
import { CharacterCreation } from "./CharacterCreation";
import { Grid } from "./Grid";
import { GameInfoPanel } from "./GameInfoPanel";
import { MainButton } from "./Button";
import { generateMessageId } from "../../providers/WebSocketProvider";
import { IsometricGrid } from "./IsometricGrid";

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

const IsWithinRange = (p1: Position, p2: Position, n: number): boolean => {
  if (!p1 || !p2) return false;
  const distance = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  return distance <= n;
};

export const IsometricGameBoard: React.FC = () => {
  const { userId, userName, connected, sendGameAction, gameRecord } =
    useWebSocket();

  const gridSize = 11;

  // Local state for character creation
  const [selectedColor, setSelectedColor] = useState<string>(PLAYER_COLORS[0]);
  const [selectedPosition, setSelectedPosition] = useState<Position>({
    x: 0,
    y: 0,
  });
  const [characterName, setCharacterName] = useState<string>(userName);
  const [viewMode, setViewMode] = useState<"isometric" | "2d">("isometric");

  // Game state checks
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const currentPlayer = latestGameState?.players[userId];
  const isMyTurn = latestGameState?.players[userId]?.isCurrentTurn;
  const isPlayerReady = latestGameState?.players[userId]?.isReady;

  const handleColorClick = (color: string) => {
    setSelectedColor(color);
  };

  const currentCharacter = currentPlayer?.character;
  const gameStatus: GameStatus =
    (latestGameState?.status as GameStatus) || GAME_STATUS.CREATING_PLAYER;

  const userHasCharacter = latestGameState?.players
    ? Object.keys(latestGameState.players).includes(userId)
    : false;

  const handleCreateCharacter = () => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "create_character",
      messageId,
      timestamp,
      character: {
        name: characterName,
        color: selectedColor,
        symbol: characterName ? characterName[0].toUpperCase() : "P",
        position: selectedPosition,
        actionPoints: 6,
        movementPoints: 4,
        isCurrentTurn: false,
      },
      userId,
      userName,
      isCurrentTurn: false,
    });
  };

  const handleReadyClick = () => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "ready_to_start",
      messageId,
      timestamp,
      userId,
    });
  };

  const handleEndTurn = () => {
    // const { messageId, timestamp } = generateMessageId();
    // sendGameAction({
    //   type: "end_turn",
    //   messageId,
    //   timestamp,
    //   userId,
    //   userName,
    // });
  };

  const handleMove = (position: Position) => {
    sendGameAction({
      type: "move",
      userId,
      position,
    });
  };

  const handleCellClick = (position: Position) => {
    setSelectedPosition(position);
    const isInRange =
      currentCharacter?.position &&
      currentCharacter.movementPoints &&
      IsWithinRange(
        currentCharacter?.position,
        position,
        currentCharacter.movementPoints
      );
    if (gameStatus === "playing" && isMyTurn && isInRange) handleMove(position);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center bg-gray-100 ">
        {currentPlayer ? (
          <GameInfoPanel
            currentPlayer={currentPlayer}
            connected={connected}
            gameRecord={gameRecord}
          />
        ) : (
          <CharacterCreation
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            handleColorClick={handleColorClick}
            handleCharacterName={(handleCharactereName) =>
              setCharacterName(handleCharactereName)
            }
          />
        )}

        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded ${
              viewMode === "2d" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
            onClick={() => setViewMode("2d")}
          >
            2D View
          </button>
          <button
            className={`px-4 py-2 rounded ${
              viewMode === "isometric"
                ? "bg-blue-500 text-white"
                : "bg-gray-200"
            }`}
            onClick={() => setViewMode("isometric")}
          >
            Isometric View
          </button>
        </div>
      </div>

      {viewMode === "isometric" ? (
        <IsometricGrid
          gridSize={gridSize}
          selectedPosition={selectedPosition}
          onCellClick={handleCellClick}
          selectedColor={selectedColor}
          latestGameState={latestGameState}
          userId={userId}
        />
      ) : (
        <Grid
          selectedPosition={selectedPosition}
          onCellClick={handleCellClick}
          selectedColor={selectedColor}
          latestGameState={latestGameState}
          userId={userId}
        />
      )}

      <MainButton
        gameStatus={gameStatus}
        connected={connected}
        handleReadyClick={handleReadyClick}
        handleEndTurn={handleEndTurn}
        isPlayerReady={isPlayerReady}
        isMyTurn={isMyTurn}
        handleSubmitClick={handleCreateCharacter}
        userHasCharacter={userHasCharacter}
      />
    </div>
  );
};
