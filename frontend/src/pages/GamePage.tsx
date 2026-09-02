import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { generateMessageId } from "../utils/messageUtils";
import { Chat } from "../components/Chat/Chat";
import { GameBoard } from "../components/Game/GameBoard";
import SpellBar from "../components/Game/Spellbar";
import { GameAction, Position, GameStatus, GAME_STATUS } from "../types/game";
import { PlayerActions } from "../components/Game/PlayerActions";
import { GameInfoPanel } from "../components/Game/GameInfoPanel";
import { GameOverModal } from "../components/Game/GameOverModal";
import { useWebSocket } from "../context/WebSocketContext";
import { readCharacter } from "../utils/characterStorage";
import { isWithinRange } from "../utils/pathUtils";
import DesktopOnlyNotice from "../components/DesktopOnlyNotice";

function GamePage() {
  const {
    userId,
    connected,
    sendGameAction,
    gameState,
    roomId,
    roomName,
    winner,
    rejection,
  } = useWebSocket();
  const navigate = useNavigate();

  const [selectedSpellId, setSelectedSpellId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null
  );
  const [visibleRejection, setVisibleRejection] = useState<string | null>(null);

  // The character request must go out exactly once, and only once the socket
  // is open: an early attempt used to be dropped with no retry, leaving the
  // player on the board with no character at all.
  const characterRequested = useRef(false);
  const character = readCharacter();

  const currentPlayer = gameState?.players[userId];
  const isMyTurn = currentPlayer?.isCurrentTurn;
  const isPlayerReady = currentPlayer?.isReady;
  const isPlayerPositioned = currentPlayer?.hasPositioned;
  const currentCharacter = currentPlayer?.character;
  const gameStatus: GameStatus =
    (gameState?.status as GameStatus) || GAME_STATUS.CREATING_PLAYER;
  const userHasCharacter = !!currentPlayer;

  // The server owns room membership; if we are not in one, go back to the list.
  useEffect(() => {
    if (!roomId) navigate("/lobby", { replace: true });
  }, [roomId, navigate]);

  useEffect(() => {
    if (!character) navigate("/", { replace: true });
  }, [character, navigate]);

  useEffect(() => {
    if (!connected || !roomId || !character) return;
    if (userHasCharacter || characterRequested.current) return;

    characterRequested.current = true;
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "create_character",
      messageId,
      timestamp,
      character,
    });
  }, [connected, roomId, character, userHasCharacter, sendGameAction]);

  useEffect(() => {
    if (!rejection) return;
    setVisibleRejection(rejection.reason);
    const timer = setTimeout(() => setVisibleRejection(null), 4000);
    return () => clearTimeout(timer);
  }, [rejection]);

  const act = (action: GameAction) => sendGameAction(action);

  const handleSelectedPosition = (position: Position | null) =>
    setSelectedPosition(position);

  const handleSpellClick = (spellId: number) =>
    setSelectedSpellId((prev) => (prev === spellId ? null : spellId));

  const handleReadyClick = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "ready_to_start", messageId, timestamp });
  };

  const handleFightClick = () => {
    if (!selectedPosition) return;
    const { messageId, timestamp } = generateMessageId();
    act({
      type: "character_positioned",
      messageId,
      timestamp,
      position: selectedPosition,
    });
  };

  const handleEndTurnClick = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "end_turn", messageId, timestamp });
    setSelectedSpellId(null);
  };

  const handlePlayAgain = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "play_again", messageId, timestamp });
    setSelectedPosition(null);
    setSelectedSpellId(null);
  };

  const handleLeave = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "leave_room", messageId, timestamp });
  };

  const handleCellClick = (position: Position) => {
    if (gameStatus === GAME_STATUS.POSITION_CHARACTERS && isPlayerPositioned) {
      return;
    }
    handleSelectedPosition(position);

    if (gameStatus !== GAME_STATUS.PLAYING || !isMyTurn) return;

    if (selectedSpellId !== null) {
      const { messageId, timestamp } = generateMessageId();
      act({
        type: "cast_spell",
        messageId,
        timestamp,
        spellId: selectedSpellId,
        targetPosition: position,
      });
      setSelectedSpellId(null);
      return;
    }

    const from = currentCharacter?.position;
    if (!from || !currentCharacter) return;
    if (isWithinRange(from, position, currentCharacter.movementPoints)) {
      const { messageId, timestamp } = generateMessageId();
      act({ type: "move", messageId, timestamp, position });
    }
  };

  return (
    <div className="relative h-screen max-h-screen bg-stone-200 text-stone-800">
      <DesktopOnlyNotice />

      {visibleRejection && (
        <div
          role="status"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-md bg-red-600 text-white text-sm shadow-lg"
        >
          {visibleRejection}
        </div>
      )}

      <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
        <span className="px-3 py-1 rounded-md bg-stone-800/80 text-stone-100 text-xs">
          {roomName}
        </span>
        <button
          type="button"
          onClick={handleLeave}
          className="px-3 py-1 rounded-md bg-stone-800/80 text-stone-100 text-xs hover:bg-stone-700"
        >
          Leave game
        </button>
      </div>

      <GameBoard
        gridSize={15}
        handleSelectedPosition={handleSelectedPosition}
        selectedPosition={selectedPosition}
        selectedSpellId={selectedSpellId}
        handleCellClick={handleCellClick}
        latestGameState={gameState}
        userId={userId}
      />

      {/*
        This bar spans the full width and is as tall as the chat, so it covers
        the bottom half of the board. Left solid, it swallowed every click in
        that half — even in the empty gaps between the panels, where nothing is
        drawn. It stays transparent to the pointer; each panel opts back in.
      */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 p-2 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 items-end">
          <Chat />
          <SpellBar
            handleSpellClick={handleSpellClick}
            selectedSpellId={selectedSpellId}
            currentPlayer={currentPlayer}
            spells={gameState?.spells ?? null}
          />

          <div className="pointer-events-auto bg-stone-50/80 backdrop-blur-sm rounded-lg flex flex-col overflow-y-auto p-2 border border-stone-300/50 shadow-lg">
            <div
              className={`flex-grow ${currentPlayer ? "overflow-y-auto" : ""}`}
            >
              {currentPlayer ? (
                <GameInfoPanel
                  currentPlayer={currentPlayer}
                  connected={connected}
                  latestGameState={gameState}
                  gameStatus={gameStatus}
                  handleReadyClick={handleReadyClick}
                  handleEndTurnClick={handleEndTurnClick}
                  isPlayerReady={isPlayerReady}
                  isMyTurn={isMyTurn}
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
          onPlayAgain={handlePlayAgain}
          onExit={handleLeave}
        />
      )}
    </div>
  );
}

export default GamePage;
