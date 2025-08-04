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
import { GameOverModal } from "./components/Game/GameOverModal";
import { useWebSocket } from "./context/WebSocketContext";
import { PLAYER_COLORS } from "./constants";

const IsWithinRange = (p1: Position, p2: Position, n: number): boolean => {
  if (!p1 || !p2) return false;
  const distance = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  return distance <= n;
};

function GameContainer() {
  const { userId, userName, connected, sendGameAction, gameRecord, winner } =
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

  const isPlayerPositioned = latestGameState?.players[userId]?.hasPositioned;

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

    // If in positioning phase and player has already positioned, do nothing.
    if (gameStatus === GAME_STATUS.POSITION_CHARACTERS && isPlayerPositioned) {
      return;
    }

    // Spell casting logic (highest priority)
    if (gameStatus === "playing" && isMyTurn && selectedSpellId) {
      handleCastSpell(position, selectedSpellId);
      setSelectedSpellId(null); // Reset after casting
      return;
    }

    // Always update selectedPosition if not in the "locked" state
    handleSelectedPosition(position);

    // Movement logic (only if not casting spell and in playing phase)
    if (gameStatus === "playing" && isMyTurn) {
      const isInitialPosition = currentCharacter?.initialPositions?.some(
        (initialPosition) =>
          initialPosition.x === position.x && initialPosition.y === position.y
      );

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
    <div className="flex flex-col h-screen max-h-screen bg-gray-900 text-white">
      {/* Game Board */}
      <div className="flex-shrink-0 h-[60vh] md:h-[75vh] rounded-lg overflow-hidden shadow-lg m-2 md:m-4">
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

      {/* Panels section */}
      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 mt-2 md:mt-4 min-h-0 px-2 md:px-4 pb-2 md:pb-4">
        {/* Chat Panel (Left) */}
        <div className="bg-gray-800 rounded-lg p-2 flex flex-col overflow-y-auto">
          <Chat />
        </div>

        {/* SpellBar Panel (Center) */}
        <div className="bg-gray-800 rounded-lg p-2 overflow-y-auto">
          <SpellBar
            handleSpellClick={handleSpellClick}
            selectedSpellId={selectedSpellId}
            currentPlayer={currentPlayer}
          />
        </div>

        {/* Info/Action Panel (Right) */}
        <div className="bg-gray-800 rounded-lg flex flex-col-reverse p-2">
          {/* Button is at the bottom because of flex-col-reverse */}
          <div className="flex-shrink-0 pt-2">
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
              selectedPosition={selectedPosition}
              isPlayerPositioned={isPlayerPositioned}
            />
          </div>

          <div
            className={`flex-grow ${currentPlayer ? "overflow-y-auto" : ""}`}
          >
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
        </div>
      </div>

      {winner && (
        <GameOverModal
          winner={winner}
          onPlayAgain={() => {
            window.location.reload();
          }}
          onExit={() => {
            alert("Exiting game. Implement your navigation here.");
          }}
        />
      )}
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
