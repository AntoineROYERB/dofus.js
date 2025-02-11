import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { Position } from "../../types/game";
import { CharacterCreation } from "./CharacterCreation";
import { Grid } from "./Grid";
import { MainButton } from "./Button";
import { GameInfoPanel } from "./GameInfoPanel";

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
  const {
    userId,
    userName,
    connected,
    gameStatus,
    sendGameAction,
    gameRecord,
  } = useWebSocket();

  const gridSize = 10;
  // Local state for character creation
  const [selectedColor, setSelectedColor] = useState<string>(PLAYER_COLORS[0]);
  const [firstPosition, setFirstPosition] = useState<Position>({ x: 0, y: 0 });

  // Game state checks
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const currentPlayer = latestGameState?.players[userId];
  const isMyTurn = latestGameState?.players[userId].isCurrentTurn;
  const isPlayerReady = false;

  const handleStartGame = () => {
    // const { messageId, timestamp } = generateMessageId();
    console.log("Attempting to start game...");
    // sendGameAction({
    //   type: "ready_to_start",
    //   messageId,
    //   timestamp,
    //   userId,
    //   userName,
    // });
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
    // const { messageId, timestamp } = generateMessageId();
    // sendGameAction({
    //   type: "move",
    //   messageId,
    //   timestamp,
    //   userId,
    //   userName,
    //   position,
    // });
  };

  // Handle cell click
  const handleCellClick = (index: number) => {
    const x = index % gridSize;
    const y = Math.floor(index / gridSize);
    setFirstPosition({ x, y });
    if (!isMyTurn || gameStatus !== "playing") return;

    // const { messageId, timestamp } = generateMessageId();
    // sendGameAction({
    //   type: "move",
    //   messageId,
    //   timestamp,
    //   userId,
    //   userName,
    //   position: { x, y },
    // });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      {currentPlayer ? (
        <GameInfoPanel
          currentPlayer={currentPlayer}
          connected={connected}
          gameStatus={gameStatus}
          gameRecord={gameRecord}
        />
      ) : (
        <CharacterCreation
          userId={userId}
          userName={userName}
          sendGameAction={sendGameAction}
          selectedColor={selectedColor}
          setSelectedColor={setSelectedColor}
          selectedPosition={firstPosition}
        />
      )}
      <Grid
        gridSize={gridSize}
        selectedPosition={firstPosition}
        onCellClick={handleCellClick}
        selectedColor={selectedColor}
      />

      <MainButton
        gameStatus={gameStatus}
        connected={connected}
        handleStartGame={handleStartGame}
        handleEndTurn={handleEndTurn}
        isPlayerReady={isPlayerReady}
        isMyTurn={isMyTurn}
      />
    </div>
  );
};
