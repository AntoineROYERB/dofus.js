import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { generateMessageId } from "../utils/messageUtils";
import { GameBoard } from "../components/Game/GameBoard";
import SpellBar from "../components/Game/Spellbar";
import { relayOf } from "../utils/terrain";
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
import { GameTutorial } from "../components/Game/GameTutorial";
import { LeaveDialog } from "../components/Game/LeaveDialog";
import {
  CornerButton,
  FighterStatus,
  SpellArc,
  TurnBar,
} from "../components/Game/PhoneHud";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  disarmTutorialMatch,
  hasSeenTutorial,
  isTutorialMatchArmed,
  markTutorialSeen,
} from "../utils/tutorialStorage";
import { TutorialFacts } from "../utils/tutorialSteps";
import { barSpells, unlockedBy } from "../utils/classUtils";
import { markDefeated, readDefeated } from "../utils/progressStorage";
import { useContent } from "../hooks/useContent";
import { hapticGameOver, hapticTurnStart } from "../lib/native";

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
  const compact = useMediaQuery("(max-height: 560px)");

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
  const { content } = useContent();

  // The solo arc. A win over a computer opponent is written down once, and
  // whatever that win opens up is worked out against what was already open,
  // so the modal only announces what is actually new.
  const [soloResult, setSoloResult] = useState<{
    farewell?: { name: string; line: string };
    unlocked: string[];
  } | null>(null);
  const bot = Object.values(gameState?.players ?? {}).find((p) => p.isBot);
  const opponent = Object.values(gameState?.players ?? {}).find(
    (p) => p.userId !== userId
  );

  /*
   * The guided first match. It only ever runs against a computer opponent:
   * over a human it would be a modal laid on someone else's turn clock. It
   * opens by itself for a player who has never seen it, and on request for
   * anyone who pressed "Play the tutorial" on the way in.
   */
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const tutorialSettled = useRef(false);
  const [peeks, setPeeks] = useState(0);
  const facingBot = !!bot;
  useEffect(() => {
    if (!facingBot || tutorialSettled.current) return;
    if (isTutorialMatchArmed() || !hasSeenTutorial()) setTutorialActive(true);
  }, [facingBot]);
  const finishTutorial = () => {
    tutorialSettled.current = true;
    setTutorialStep(0);
    setTutorialActive(false);
    markTutorialSeen();
    disarmTutorialMatch();
  };
  const tutorialFacts: TutorialFacts = {
    status: gameStatus,
    hasPositioned: !!isPlayerPositioned,
    isMyTurn: !!isMyTurn,
    movementPoints: currentCharacter?.movementPoints ?? 0,
    maxMovementPoints: currentCharacter?.maxMovementPoints ?? 0,
    opponentHealth: opponent?.character.health ?? 0,
    peeks,
    turnNumber: gameState?.turnNumber ?? 0,
  };
  const wonAgainstBot =
    !!winner && !!bot && !!currentCharacter?.isAlive && !bot.character.isAlive;
  useEffect(() => {
    if (!winner) {
      setSoloResult(null);
      return;
    }
    if (!wonAgainstBot || !bot?.character.class || !content) return;
    const classId = bot.character.class;
    const before = readDefeated();
    markDefeated(classId);
    const beaten = content.classes.find((c) => c.id === classId);
    setSoloResult({
      farewell: beaten
        ? { name: beaten.opponent.name, line: beaten.opponent.lines[1] ?? "" }
        : undefined,
      unlocked: before.has(classId)
        ? []
        : unlockedBy(content.classes, classId).map((c) => c.opponent.name),
    });
    // Once per result: the bot's snapshot changes every tick, its class does not.
  }, [winner, wonAgainstBot, bot?.character.class, content]);

  // On the iOS app the phone buzzes as the turn comes round and as the fight
  // ends; a player can look away from the board without missing either.
  useEffect(() => {
    if (gameStatus === GAME_STATUS.PLAYING && isMyTurn) hapticTurnStart();
  }, [gameStatus, isMyTurn]);
  useEffect(() => {
    if (winner) hapticGameOver(!!currentCharacter?.isAlive);
    // Once per result, not on every tick that follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);

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

  const handleEndTurnClick = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "end_turn", messageId, timestamp });
    setSelectedSpellId(null);
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

  // P does whatever the main button underneath the board currently does:
  // confirm a placement while positioning, end the turn once play starts.
  const handleMainButtonKey = () => {
    if (gameStatus === GAME_STATUS.POSITION_CHARACTERS) {
      if (connected && selectedPosition && !isPlayerPositioned) {
        handleFightClick();
      }
      return;
    }
    if (gameStatus === GAME_STATUS.PLAYING && isMyTurn) {
      handleEndTurnClick();
    }
  };

  // Number keys pick a spell, Escape drops the selection, Tab and P end the
  // turn (P also confirms a placement), the way the game this is modelled on
  // does it. Keystrokes aimed at the chat are left alone.
  useEffect(() => {
    // The same order the bar draws its slots in, so key 3 is the third slot.
    const catalogue = barSpells(currentPlayer, gameState?.spells);
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
      if (event.key === "Tab") {
        event.preventDefault();
        if (isMyTurn) handleEndTurnClick();
        return;
      }
      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        handleMainButtonKey();
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
  }, [
    gameState?.spells,
    currentPlayer,
    isMyTurn,
    handleEndTurnClick,
    handleMainButtonKey,
  ]);

  const handlePlayAgain = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "play_again", messageId, timestamp });
    setSelectedPosition(null);
    setSelectedSpellId(null);
  };

  const handleLeave = () => {
    setLeaveAsked(false);
    const { messageId, timestamp } = generateMessageId();
    act({ type: "leave_room", messageId, timestamp });
  };

  // Walking out before anyone has fought costs nothing; once the fight is on,
  // it is a forfeit, so the button asks first.
  const [leaveAsked, setLeaveAsked] = useState(false);
  const requestLeave = () => {
    if (
      gameStatus === GAME_STATUS.PLAYING ||
      gameStatus === GAME_STATUS.POSITION_CHARACTERS
    ) {
      setLeaveAsked(true);
    } else {
      handleLeave();
    }
  };

  const handleCellClick = (position: Position) => {
    if (gameStatus === GAME_STATUS.POSITION_CHARACTERS && isPlayerPositioned) {
      return;
    }
    handleSelectedPosition(position);

    if (gameStatus !== GAME_STATUS.PLAYING || !isMyTurn) return;

    if (selectedSpellId !== null) {
      const { messageId, timestamp } = generateMessageId();
      // A spell cast on yourself lands on yourself, whichever cell was clicked.
      const onSelf =
        gameState?.spells?.[String(selectedSpellId)]?.targeting === "self";
      act({
        type: "cast_spell",
        messageId,
        timestamp,
        spellId: selectedSpellId,
        targetPosition:
          onSelf && currentCharacter?.position
            ? currentCharacter.position
            : position,
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
      blockedBy(gameState?.obstacles, occupied, gameState?.terrain)
    );
    if (path && path.length > 0 && path.length <= currentCharacter.movementPoints) {
      const { messageId, timestamp } = generateMessageId();
      act({ type: "move", messageId, timestamp, position });
    }
  };

  // Everything laid over either layout: notices, the log sheet, the result,
  // the leave confirmation and the tutorial.
  const overlays = (
    <>
        {visibleRejection && (
          <div
            role="status"
            className="absolute left-1/2 top-3 z-40 max-w-[92vw] -translate-x-1/2 border border-vermilion bg-vermilion px-4 py-2 text-center text-[13px] text-white"
          >
            {visibleRejection}
          </div>
        )}

        {railOpen && (
          <div className="fixed inset-0 z-40">
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
                onLeave={() => {
                  setRailOpen(false);
                  requestLeave();
                }}
                onReplayTutorial={() => setTutorialActive(true)}
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
            farewell={soloResult?.farewell}
            unlocked={soloResult?.unlocked}
          />
        )}

        {leaveAsked && !winner && (
          <LeaveDialog
            onConfirm={handleLeave}
            onCancel={() => setLeaveAsked(false)}
          />
        )}

        <GameTutorial
          active={tutorialActive}
          facts={tutorialFacts}
          step={tutorialStep}
          onStep={setTutorialStep}
          onFinish={finishTutorial}
        />
    </>
  );

  /*
   * A phone held sideways: the board fills the screen and the controls sit
   * over its corners, spells in an arc under the right thumb. A tap on a cell
   * previews it and a bubble confirms it; holding a spell shows what it does.
   */
  if (compact) {
    const main =
      gameStatus === GAME_STATUS.POSITION_CHARACTERS
        ? {
            label: isPlayerPositioned ? "Waiting…" : "Fight",
            disabled: !connected || !selectedPosition || !!isPlayerPositioned,
            onClick: handleFightClick,
            beckon: connected && !!selectedPosition && !isPlayerPositioned,
          }
        : gameStatus === GAME_STATUS.PLAYING
          ? {
              label: "End turn",
              disabled: !isMyTurn,
              onClick: handleEndTurnClick,
            }
          : gameStatus === GAME_STATUS.GAME_OVER
            ? null
            : {
                label: connected ? "Waiting…" : "Offline",
                disabled: true,
                onClick: () => {},
              };

    return (
      <div className="fixed inset-0 select-none overflow-hidden bg-paper text-ink">
        {/* A little lower than the top edge, so the far row clears the turn bar. */}
        <div id="tutorial-board" className="absolute inset-x-0 bottom-0 top-5">
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

        <div className="pointer-events-none absolute inset-0 pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(8px,env(safe-area-inset-top))]">
          <div className="pointer-events-auto absolute left-[max(12px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))]">
            <TurnBar
              gameState={gameState}
              userId={userId}
              phase={phaseLabel(gameStatus, isMyTurn)}
            />
          </div>
          <div className="pointer-events-auto absolute right-[max(12px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] flex gap-2">
            <CornerButton label="Log" onClick={() => setRailOpen(true)} />
            <CornerButton label="Leave" onClick={requestLeave} />
          </div>
          <div
            id="tutorial-fighter-panel"
            className="pointer-events-auto absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))]"
          >
            <FighterStatus player={currentPlayer} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 mb-[env(safe-area-inset-bottom)] mr-[env(safe-area-inset-right)]">
          <SpellArc
            player={currentPlayer}
            spells={gameState?.spells ?? null}
            selectedSpellId={selectedSpellId}
            onSelectSpell={handleSpellClick}
            main={main}
            isMyTurn={!!isMyTurn}
            turnEndsAt={gameState?.turnEndsAt ?? 0}
            turnNumber={gameState?.turnNumber ?? 0}
            hasRelay={!!relayOf(gameState?.terrain, userId)}
            status={gameStatus}
            onPeek={() => setPeeks((n) => n + 1)}
          />
        </div>

        {overlays}
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper text-ink">

      {/*
        The board keeps the whole left side to itself. Nothing is ever laid on
        top of it: the rail is beside it and the bar is under it, which is the
        point of the whole layout. On a narrow screen the rail becomes a sheet
        rather than taking the board's room. Held upright, the spells get a
        row of their own; held sideways, the phone layout above takes over.
      */}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col pl-[env(safe-area-inset-left)]">
          <div className="flex-none px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-4">
            <TurnTimeline
              latestGameState={gameState}
              userId={userId}
              onOpenRail={() => setRailOpen(true)}
              onLeave={requestLeave}
            />
          </div>
          <RotateHint />
          <div id="tutorial-board" className="relative min-h-0 flex-1">
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
            onLeave={requestLeave}
            onReplayTutorial={() => setTutorialActive(true)}
          />
        </aside>
      </div>

      <div className="flex h-[168px] flex-none overflow-hidden border-t-2 border-ink bg-panel pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] narrow:h-auto narrow:flex-wrap">
        <div
          id="tutorial-fighter-panel"
          className="w-[142px] flex-none px-3 py-2 narrow:min-w-0 narrow:flex-1 sm:w-[230px] sm:px-5 sm:py-3 lg:w-[336px]"
        >
          <FighterPanel currentPlayer={currentPlayer} connected={connected} />
        </div>

        <div
          id="tutorial-spellbar"
          className="min-w-0 flex-1 border-l border-ink px-3 py-2 narrow:order-last narrow:basis-full narrow:border-l-0 narrow:border-t narrow:pb-3 sm:px-5 sm:py-3"
        >
          <SpellBar
            handleSpellClick={handleSpellClick}
            selectedSpellId={selectedSpellId}
            currentPlayer={currentPlayer}
            spells={gameState?.spells ?? null}
            turnNumber={gameState?.turnNumber ?? 0}
            hasRelay={!!relayOf(gameState?.terrain, userId)}
            onPeek={() => setPeeks((n) => n + 1)}
          />
        </div>

        <div
          id="tutorial-mainbutton"
          className="flex w-[124px] flex-none flex-col border-l border-ink px-3 py-2 sm:w-[176px] sm:px-5 sm:py-3 lg:w-[248px]"
        >
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
          <div className="mt-2 hidden sm:block">
            <TurnClock
              turnEndsAt={gameState?.turnEndsAt ?? 0}
              isMyTurn={!!isMyTurn}
              variant="display"
            />
          </div>
          <div className="mt-auto narrow:pt-2">
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

      {overlays}
    </div>
  );
}

export default GamePage;
