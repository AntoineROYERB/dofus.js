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
import { PLAYER_COLORS } from "./constants";

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
  const characterPosition =
    latestGameState?.players[userId]?.character?.position;

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
    setSelectedSpellId((prevId) => (prevId === spellId ? null : spellId));
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
      type: "cast_spell",
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
        hasPlayedThisTurn: false,
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

  const handleFightClick = () => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "character_positioned",
      messageId,
      timestamp,
      userId,
      position: selectedPosition,
    });
  };

  const handleEndTurnClick = () => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "end_turn",
      messageId,
      timestamp,
      userId,
    });
  };

  const handleMove = (position: Position) => {
    const { messageId, timestamp } = generateMessageId();

    sendGameAction({
      type: "move",
      userId,
      position,
      messageId,
      timestamp,
    });
  };

  const handleCellClick = (position: Position) => {
    console.log(`Cell clicked at position: (${position.x}, ${position.y})`);

    if (gameStatus === "playing" && isMyTurn && selectedSpellId) {
      handleCastSpell(position, selectedSpellId);
      setSelectedSpellId(null); // Reset after casting
      return;
    }

    handleSelectedPosition(position);

    const isInitialPosition = currentCharacter?.initialPositions?.some(
      (initialPosition) =>
        initialPosition.x === position.x && initialPosition.y === position.y
    );

    if (gameStatus === GAME_STATUS.POSITION_CHARACTERS) {
      if (isInitialPosition) {
        handleFightClick();
      }
    } else if (gameStatus === "playing" && isMyTurn) {
      const isInRange =
        currentCharacter?.position &&
        currentCharacter.movementPoints &&
        IsWithinRange(
          currentCharacter?.position,
          position,
          currentCharacter.movementPoints
        );

      if (
        isInRange ||
        (isInitialPosition && latestGameState.turnNumber === 0)
      ) {
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
          latestGameState={latestGameState}
          userId={userId}
        />
      </div>
      <div className="h-[20vh] overflow-y-auto">
        <Chat />
      </div>
      <div className="h-[20vh]">
        <SpellBar
          handleSpellClick={handleSpellClick}
          selectedSpellId={selectedSpellId}
          currentPlayer={currentPlayer}
        />
      </div>
      <div className="h-[20vh] flex flex-col">
        <div className="flex-grow overflow-y-auto">
          {currentPlayer ? (
            <GameInfoPanel
              currentPlayer={currentPlayer}
              connected={connected}
              latestGameState={latestGameState}
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
            handleEndTurnClick={handleEndTurnClick}
            isPlayerReady={isPlayerReady}
            isMyTurn={isMyTurn}
            handleSubmitClick={handleCreateCharacter}
            userHasCharacter={userHasCharacter}
            handleFightClick={handleFightClick}
            selectedPosition={characterPosition}
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
