import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { generateMessageId } from "../utils/messageUtils";
import { GameBoard } from "../components/Game/GameBoard";
import SpellBar from "../components/Game/Spellbar";
import { GameAction, Position, GameStatus, GAME_STATUS } from "../types/game";
import { FighterPanel } from "../components/Game/FighterPanel";
import { TurnTimeline } from "../components/Game/TurnTimeline";
import { TurnClock } from "../components/Game/TurnClock";
import { MainButton } from "../components/Game/Button";
import { GameOverModal } from "../components/Game/GameOverModal";
import { useWebSocket } from "../context/WebSocketContext";
import { readCharacter } from "../utils/characterStorage";
import { blockedBy, findPath } from "../utils/board";
import { RotateHint } from "../components/Game/RotateHint";
import { SideRail } from "../components/Game/SideRail";
import { useRejectionBanner } from "../hooks/useRejectionBanner";

/** What the turn zone says above the countdown. */
const phaseLabel = (status: GameStatus, isMyTurn: boolean | undefined) => {
  switch (status) {
    case GAME_STATUS.CREATING_PLAYER:
      return "Getting ready";
    case GAME_STATUS.POSITION_CHARACTERS:
      return "Placement";
    case GAME_STATUS.PLAYING:
      return isMyTurn ? "Your turn" : "Opponent's turn";
    default:
      return "Over";
  }
};

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
  const visibleRejection = useRejectionBanner(rejection);
  // Below lg the rail is a sheet: the board keeps the screen until asked.
  const [railOpen, setRailOpen] = useState(false);

  // The character request must go out exactly once, and only once the socket
  // is open: an early attempt used to be dropped with no retry, leaving the
  // player on the board with no character at all.
  const characterRequested = useRef(false);
  const character = readCharacter();

  const currentPlayer = gameState?.players[userId];
  const isMyTurn = currentPlayer?.isCurrentTurn;
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

  const act = (action: GameAction) => sendGameAction(action);

  const handleSelectedPosition = (position: Position | null) =>
    setSelectedPosition(position);

  const handleSpellClick = (spellId: number) =>
    setSelectedSpellId((prev) => (prev === spellId ? null : spellId));

  // Number keys pick a spell and Escape drops the selection, the way the game
  // this is modelled on does it. Keystrokes aimed at the chat are left alone.
  useEffect(() => {
    const catalogue = Object.values(gameState?.spells ?? {}).sort(
      (a, b) => a.id - b.id
    );
    if (catalogue.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        setSelectedSpellId(null);
        return;
      }
      const slot = Number(event.key);
      if (!Number.isInteger(slot) || slot < 1 || slot > catalogue.length) return;

      event.preventDefault();
      const spell = catalogue[slot - 1];
      setSelectedSpellId((prev) => (prev === spell.id ? null : spell.id));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameState?.spells]);

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

    // Same walk the server will charge for, cover and characters included.
    const occupied = Object.values(gameState?.players ?? {})
      .map((p) => p.character.position)
      .filter((p): p is Position => !!p && p !== from);
    const path = findPath(
      from,
      position,
      blockedBy(gameState?.obstacles, occupied)
    );
    if (path && path.length > 0 && path.length <= currentCharacter.movementPoints) {
      const { messageId, timestamp } = generateMessageId();
      act({ type: "move", messageId, timestamp, position });
    }
  };

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper text-ink">
      {visibleRejection && (
        <div
          role="status"
          className="absolute left-1/2 top-3 z-40 max-w-[92vw] -translate-x-1/2 border border-vermilion bg-vermilion px-4 py-2 text-center text-[13px] text-white"
        >
          {visibleRejection}
        </div>
      )}

      {/*
        The board keeps the whole left side to itself. Nothing is ever laid on
        top of it: the rail is beside it and the bar is under it, which is the
        point of the whole layout. On a narrow screen the rail becomes a sheet
        rather than taking the board's room.
      */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col pl-[env(safe-area-inset-left)]">
          <div className="flex-none px-3 pt-3 sm:px-6 sm:pt-4">
            <TurnTimeline
              latestGameState={gameState}
              userId={userId}
              onOpenRail={() => setRailOpen(true)}
            />
          </div>
          <RotateHint />
          <div className="relative min-h-0 flex-1">
            <GameBoard
              gridSize={15}
              handleSelectedPosition={handleSelectedPosition}
              selectedPosition={selectedPosition}
              selectedSpellId={selectedSpellId}
              handleCellClick={handleCellClick}
              latestGameState={gameState}
              userId={userId}
            />
          </div>
        </div>

        <aside className="hidden w-[300px] flex-none flex-col pl-5 pr-[calc(1.25rem+env(safe-area-inset-right))] pt-4 lg:flex">
          <SideRail
            roomName={roomName}
            latestGameState={gameState}
            onLeave={handleLeave}
          />
        </aside>
      </div>

      <div className="flex h-[168px] flex-none overflow-hidden border-t-2 border-ink bg-panel pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] short:h-[118px]">
        <div className="w-[142px] flex-none px-3 py-2 sm:w-[230px] sm:px-5 sm:py-3 lg:w-[336px]">
          <FighterPanel currentPlayer={currentPlayer} connected={connected} />
        </div>

        <div className="min-w-0 flex-1 border-l border-ink px-3 py-2 sm:px-5 sm:py-3">
          <SpellBar
            handleSpellClick={handleSpellClick}
            selectedSpellId={selectedSpellId}
            currentPlayer={currentPlayer}
            spells={gameState?.spells ?? null}
          />
        </div>

        <div className="flex w-[124px] flex-none flex-col border-l border-ink px-3 py-2 sm:w-[176px] sm:px-5 sm:py-3 lg:w-[248px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
              Turn
            </span>
            <span className="hidden truncate font-mono text-[9.5px] uppercase tracking-label text-ink sm:inline">
              {phaseLabel(gameStatus, isMyTurn)}
            </span>
            {/* Where the big countdown does not fit, a small one still must. */}
            <span className="sm:hidden">
              <TurnClock
                turnEndsAt={gameState?.turnEndsAt ?? 0}
                isMyTurn={!!isMyTurn}
              />
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[9.5px] uppercase tracking-label text-ink sm:hidden">
            {phaseLabel(gameStatus, isMyTurn)}
          </div>
          <div className="mt-2 hidden sm:block short:hidden">
            <TurnClock
              turnEndsAt={gameState?.turnEndsAt ?? 0}
              isMyTurn={!!isMyTurn}
              variant="display"
            />
          </div>
          <div className="mt-auto">
            <MainButton
              gameStatus={gameStatus}
              connected={connected}
              handleEndTurnClick={handleEndTurnClick}
              isMyTurn={isMyTurn}
              handleFightClick={handleFightClick}
              selectedPosition={selectedPosition ?? undefined}
              isPlayerPositioned={isPlayerPositioned}
            />
          </div>
        </div>
      </div>

      {railOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close the log"
            onClick={() => setRailOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <aside className="absolute bottom-0 right-0 top-0 flex w-[min(340px,88vw)] flex-col border-l-2 border-ink bg-paper pl-5 pr-[calc(1.25rem+env(safe-area-inset-right))] pt-4">
            <SideRail
              roomName={roomName}
              latestGameState={gameState}
              onLeave={handleLeave}
              onClose={() => setRailOpen(false)}
            />
          </aside>
        </div>
      )}

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
