import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { generateMessageId } from "./../utils/messageUtils.ts";
import { Chat } from "../components/Chat/Chat";
import { GameBoard } from "../components/Game/GameBoard";
import SpellBar from "../components/Game/Spellbar";
import { Position, GameStatus, GAME_STATUS } from "../types/game";
import { PlayerActions } from "../components/Game/PlayerActions";
import { GameInfoPanel } from "../components/Game/GameInfoPanel";
import { GameOverModal } from "../components/Game/GameOverModal";
import { useWebSocket } from "../context/WebSocketContext";

const IsWithinRange = (p1: Position, p2: Position, n: number): boolean => {
  if (!p1 || !p2) return false;
  const distance = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  return distance <= n;
};

function GamePage() {
  const { userId, userName, connected, sendGameAction, gameRecord, winner } =
    useWebSocket();
  const location = useLocation();
  const { characterName, selectedColor } = location.state || {};

  const [selectedSpellId, setSelectedSpellId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null
  );

  // Game state checks
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const currentPlayer = latestGameState?.players[userId];
  const isMyTurn = latestGameState?.players[userId]?.isCurrentTurn;
  const isPlayerReady = latestGameState?.players[userId]?.isReady;
  const currentCharacter = currentPlayer?.character;
  const gameStatus: GameStatus =
    (latestGameState?.status as GameStatus) || GAME_STATUS.CREATING_PLAYER;
  const userHasCharacter = !!currentPlayer;

  const isPlayerPositioned = latestGameState?.players[userId]?.hasPositioned;

  useEffect(() => {
    if (characterName && selectedColor && !userHasCharacter) {
      const { messageId, timestamp } = generateMessageId();
      sendGameAction({
        type: "create_character",
        messageId,
        timestamp,
        character: {
          name: characterName,
          color: selectedColor,
          symbol: (characterName || "P")[0].toUpperCase(),
          actionPoints: 6,
          movementPoints: 4,
          isCurrentTurn: false,
          hasPlayedThisTurn: false,
          health: 100,
        },
        userId,
        userName,
        isCurrentTurn: false,
      });
    }
  }, [
    characterName,
    selectedColor,
    userHasCharacter,
    sendGameAction,
    userId,
    userName,
  ]);

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
      targetPosition: position,
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

    // Always update selectedPosition if not in the "locked" state
    handleSelectedPosition(position);

    // Movement logic (only if not casting spell and in playing phase)
    if (gameStatus === "playing" && isMyTurn && selectedSpellId == null) {
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

    // Spell casting logic (highest priority)
    if (gameStatus === "playing" && isMyTurn && selectedSpellId !== null) {
      handleCastSpell(position, selectedSpellId);
      setSelectedSpellId(null); // Reset after casting
      return;
    }
  };

  return (
    <div className="relative h-screen max-h-screen bg-stone-200 text-stone-800">
      <GameBoard
        gridSize={15}
        handleSelectedPosition={handleSelectedPosition}
        selectedPosition={selectedPosition}
        selectedSpellId={selectedSpellId}
        handleCellClick={handleCellClick}
        latestGameState={latestGameState}
        userId={userId}
      />

      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 items-end">
          <Chat />
          <SpellBar
            handleSpellClick={handleSpellClick}
            selectedSpellId={selectedSpellId}
            currentPlayer={currentPlayer}
          />

          <div className="bg-stone-50/80 backdrop-blur-sm rounded-lg flex flex-col overflow-y-auto p-2 border border-stone-300/50 shadow-lg">
            <div
              className={`flex-grow ${currentPlayer ? "overflow-y-auto" : ""}`}
            >
              {currentPlayer ? (
                <GameInfoPanel
                  currentPlayer={currentPlayer}
                  connected={connected}
                  latestGameState={latestGameState}
                  gameStatus={gameStatus}
                  handleReadyClick={handleReadyClick}
                  handleEndTurnClick={handleEndTurnClick}
                  isPlayerReady={isPlayerReady}
                  isMyTurn={isMyTurn}
                  handleSubmitClick={() => {}}
                  userHasCharacter={userHasCharacter}
                  handleFightClick={handleFightClick}
                  selectedPosition={selectedPosition ?? undefined}
                  isPlayerPositioned={isPlayerPositioned}
                />
              ) : (
                <PlayerActions
                  gameStatus={gameStatus}
                  connected={connected}
                  handleReadyClick={handleReadyClick}
                  handleEndTurnClick={handleEndTurnClick}
                  isPlayerReady={isPlayerReady}
                  isMyTurn={isMyTurn}
                  handleSubmitClick={() => {}}
                  userHasCharacter={userHasCharacter}
                  handleFightClick={handleFightClick}
                  selectedPosition={selectedPosition ?? undefined}
                  isPlayerPositioned={isPlayerPositioned}
                />
              )}
            </div>
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

export default GamePage;
