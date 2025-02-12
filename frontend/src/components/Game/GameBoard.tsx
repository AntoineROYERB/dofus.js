import React, { useState } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { Character, Position } from "../../types/game";
import { CharacterCreation } from "./CharacterCreation";
import { Grid } from "./Grid";
import { MainButton } from "./Button";
import { GameInfoPanel } from "./GameInfoPanel";
import { generateMessageId } from "../../providers/WebSocketProvider";

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
  const [characterName, setCharacterName] = useState<string>(userName);
  // Game state checks
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const currentPlayer = latestGameState?.players[userId];
  const isMyTurn = latestGameState?.players[userId].isCurrentTurn;
  const isPlayerReady = false;

  const handleColorClick = (color: string) => {
    setSelectedColor(color);
  };

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
        position: firstPosition,
        actionPoints: 6,
        movementPoints: 3,
        isCurrentTurn: false,
      },
      userId,
      userName,
      isCurrentTurn: false,
    });
  };
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
          selectedColor={selectedColor}
          setSelectedColor={setSelectedColor}
          handleSubmitClick={handleCreateCharacter}
          handleColorClick={handleColorClick}
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
