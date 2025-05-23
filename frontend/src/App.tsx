import { useState } from "react";
import {
  WebSocketProvider,
  generateMessageId,
} from "./providers/WebSocketProvider";
import { Chat } from "./components/Chat/Chat";
import { GameBoard } from "./components/Game/GameBoard";
import SpellBar from "./components/Game/Spellbar";
import { Position, GameStatus, GAME_STATUS } from "./types/game";
import { CharacterCreation } from "./components/Game/CharacterCreation";
import { GameInfoPanel } from "./components/Game/GameInfoPanel";
import { MainButton } from "./components/Game/Button";
import { useWebSocket } from "./context/WebSocketContext";

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

function GameContainer() {
  const { userId, userName, connected, sendGameAction, gameRecord } =
    useWebSocket();
  const [selectedSpellId, setSelectedSpellId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null
  );
  const [selectedColor, setSelectedColor] = useState<string>(PLAYER_COLORS[0]);
  const [characterName, setCharacterName] = useState<string>(userName);

  // Game state checks
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const currentPlayer = latestGameState?.players[userId];
  const isMyTurn = latestGameState?.players[userId]?.isCurrentTurn;
  const isPlayerReady = latestGameState?.players[userId]?.isReady;
  const currentCharacter = currentPlayer?.character;
  const gameStatus: GameStatus =
    (latestGameState?.status as GameStatus) || GAME_STATUS.CREATING_PLAYER;
  const userHasCharacter = latestGameState?.players
    ? Object.keys(latestGameState.players).includes(userId)
    : false;

  const handleSelectedPosition = (position: Position | null) => {
    if (position) {
      setSelectedPosition(position);
      console.log(`Selected position: ${position.x}, ${position.y}`);
    } else {
      setSelectedPosition(null);
      console.log("No position selected");
    }
  };

  const handleSpellClick = (spellId: number) => {
    setSelectedSpellId(spellId);
    console.log(`Spell ${spellId} selected`);
  };

  const handleColorClick = (color: string) => {
    setSelectedColor(color);
  };

  const handleCastSpell = (position: Position, spellId: number) => {
    const { messageId, timestamp } = generateMessageId();
    console.log(
      `Casting spell ${spellId} at position (${position.x}, ${position.y})`
    );
    sendGameAction({
      type: "spell_cast",
      userId,
      messageId,
      timestamp,
      spellId,
      TargetPosition: position,
    });
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
    handleSelectedPosition(position);

    const isInRange =
      currentCharacter?.position &&
      currentCharacter.movementPoints &&
      IsWithinRange(
        currentCharacter?.position,
        position,
        currentCharacter.movementPoints
      );

    if (gameStatus === "playing" && isMyTurn) {
      if (selectedSpellId) {
        handleCastSpell(position, selectedSpellId);
      } else if (isInRange) {
        handleMove(position);
      }
    }
  };

  return (
    <div className="grid grid-cols-3 h-screen max-h-screen">
      <div className="col-span-3 h-[80vh]">
        <GameBoard
          gridSize={15}
          handleSelectedPosition={handleSelectedPosition}
          selectedPosition={selectedPosition}
          selectedSpellId={selectedSpellId}
          handleCellClick={handleCellClick}
          selectedColor={selectedColor}
          latestGameState={latestGameState}
          userId={userId}
        />
      </div>
      <div className="h-[20vh] overflow-y-auto">
        <Chat />
      </div>
      <div className="h-[20vh]">
        <SpellBar handleSpellClick={handleSpellClick} />
      </div>
      <div className="h-[20vh] flex flex-col">
        <div className="flex-grow overflow-y-auto">
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
              handleCharacterName={(name) => setCharacterName(name)}
            />
          )}
        </div>
        <div className="pb-1">
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
      </div>
    </div>
  );
}

function App() {
  return (
    <WebSocketProvider>
      <GameContainer />
    </WebSocketProvider>
  );
}

export default App;
