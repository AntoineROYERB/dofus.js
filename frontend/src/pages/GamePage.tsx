import { useState, useEffect, useMemo, useRef } from "react";
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
import { blockedBy, findPath, pathCost } from "../utils/board";
import { stepCostOf } from "../utils/ground";
import { RotateHint } from "../components/Game/RotateHint";
import { RailBody, RailExits, SideRail } from "../components/Game/SideRail";
import { SideSheet } from "../components/Overlay";
import { useRejectionBanner } from "../hooks/useRejectionBanner";
import { GameTutorial } from "../components/Game/GameTutorial";
import { LeaveDialog } from "../components/Game/LeaveDialog";
import { ShortcutSheet } from "../components/Game/ShortcutSheet";
import {
  CommandDeck,
  MainAction,
  MenuButton,
  PortraitGauge,
  SpellHint,
  TurnBar,
  YourTurnBanner,
} from "../components/Game/PhoneHud";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { shortcutFor } from "../utils/shortcuts";
import {
  armTutorialMatch,
  disarmTutorialMatch,
  forgetTutorialStep,
  isTutorialMatchArmed,
  markTutorialSeen,
  readTutorialProgress,
  rememberTutorialStep,
} from "../utils/tutorialStorage";
import {
  TUTORIAL_STEPS,
  TutorialFacts,
  resumeIndex,
} from "../utils/tutorialSteps";
import {
  barSpells,
  beatenChampions,
  championOf,
  kitOf,
  settleLoadout,
  unlockedBy,
} from "../utils/loadoutUtils";
import { infusedBook, unavailableReason } from "../utils/spellUtils";
import { markDefeated, readDefeated } from "../utils/progressStorage";
import { useContent } from "../hooks/useContent";
import { hapticGameOver, hapticTap, hapticTurnStart } from "../lib/native";
import { sameSide, teamed } from "../utils/sides";
import { RULES } from "../utils/terrain";

/** Why the match is being left: back to the list, or into a fresh tutorial. */
type LeaveIntent = "lobby" | "tutorial";

/** What the turn zone says above the countdown. */
const phaseLabel = (status: GameStatus, isMyTurn: boolean | undefined, allyTurn = false) => {
  switch (status) {
    case GAME_STATUS.CREATING_PLAYER:
      return "Getting ready";
    case GAME_STATUS.POSITION_CHARACTERS:
      return "Placement";
    case GAME_STATUS.PLAYING:
      return isMyTurn ? "Your turn" : allyTurn ? "Ally's turn" : "Opponent's turn";
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
    dream,
  } = useWebSocket();
  const navigate = useNavigate();
  /*
   * A floor of Endless Dreams. The server seats the party itself, the run
   * moves on win or lose — no rematch — and the solo arc and the tutorial
   * have nothing to do with it.
   */
  const dreaming = !!dream && dream.phase !== "over";
  const dreamFight = dreaming || teamed(gameState?.players);

  const [selectedSpellId, setSelectedSpellId] = useState<number | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null
  );
  const visibleRejection = useRejectionBanner(rejection);
  // Below lg the rail is a sheet: the board keeps the screen until asked.
  const [railOpen, setRailOpen] = useState(false);
  // Declared up here because the keyboard reads it long before the Leave
  // button that sets it is laid out.
  const [leaveAsked, setLeaveAsked] = useState<LeaveIntent | null>(null);
  const compact = useMediaQuery("(max-height: 560px)");
  // A desk, or a tablet held sideways: wide enough for the board to keep the
  // whole width, with the deck and the portrait laid over its corners as on a
  // phone. Below this, a phone held upright keeps its bar under the board.
  const wide = useMediaQuery("(min-width: 900px)");

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
  const { content, failed: contentFailed } = useContent();
  // The catalogue as this player casts it: a legendary's ultimate takes on
  // the element they wear.
  const myElement = kitOf(currentCharacter?.loadout, content)?.element;
  const spellBook = useMemo(
    () => infusedBook(gameState?.spells, myElement),
    [gameState?.spells, myElement]
  );

  // The solo arc. A win over a computer opponent is written down once, and
  // whatever that win opens up is worked out against what was already open,
  // so the modal only announces what is actually new.
  const [soloResult, setSoloResult] = useState<{
    farewell?: { name: string; line: string };
    unlocked: string[];
  } | null>(null);
  const bot = Object.values(gameState?.players ?? {}).find((p) => p.isBot);
  const botChampion = championOf(bot?.character.loadout, content?.champions ?? [])?.id;
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
  const facingBot = !!bot && !dreamFight;
  const positioned = !!isPlayerPositioned;
  useEffect(() => {
    if (!facingBot || tutorialSettled.current) return;
    const progress = readTutorialProgress();
    // Wherever this device left off, as far as this match can honour it.
    const open = () => {
      setTutorialStep(resumeIndex(progress.lastStep, positioned));
      setTutorialActive(true);
    };
    // The request is spent the moment it is answered, not when the tour ends:
    // left unspent, walking out of the tutorial match sends the lobby off to
    // open another one the moment it is mounted again, and the player is back
    // in a fight they did not ask for.
    if (isTutorialMatchArmed()) {
      disarmTutorialMatch();
      open();
      return;
    }
    if (!progress.seen) open();
    // Whether the player has been placed is read once, as the tour opens; it
    // must not re-open the tour the moment they stand somewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingBot]);
  // Every step the tour moves to is written down, so the way back in is the
  // step that was open rather than the first card.
  const goToTutorialStep = (step: number) => {
    setTutorialStep(step);
    const id = TUTORIAL_STEPS[step]?.id;
    if (id) rememberTutorialStep(id);
  };
  const opponentIsDummy = !!bot?.isDummy;
  const finishTutorial = () => {
    // Leaving the tour, by any door, ends the truce: the opponent that stood
    // still while the buttons were explained starts fighting, in this same
    // match. A player who skips out is not left punching a statue.
    if (opponentIsDummy) {
      const { messageId, timestamp } = generateMessageId();
      act({ type: "wake_opponent", messageId, timestamp });
    }
    tutorialSettled.current = true;
    setTutorialStep(0);
    setTutorialActive(false);
    // Seen, and no step left half-finished: this tour is over, and the next
    // one — asked for by name — starts at the first card.
    markTutorialSeen();
    disarmTutorialMatch();
  };
  /*
   * The turn as an ultimate reads it. A dream's Early Ultimate opens it from
   * the first turn, and the bar, the arc and the tour all ask the same
   * question of the turn number, so they are handed the answer.
   */
  const earlyUltimate = !!currentPlayer?.boons?.some(
    (id) => content?.dream?.boons.find((b) => b.id === id)?.effect.kind === "earlyUltimate"
  );
  const ultimateTurn = earlyUltimate
    ? Math.max(gameState?.turnNumber ?? 0, RULES.ultimateFromTurn)
    : (gameState?.turnNumber ?? 0);
  // Whether anything on the bar could be cast at all: the same rules the bar
  // itself greys a slot with, so the tour and the slot never disagree.
  const canCast = barSpells(currentPlayer, spellBook).some(
    (spell) =>
      !unavailableReason(
        spell,
        currentPlayer?.spells?.[String(spell.id)],
        currentCharacter?.actionPoints ?? 0,
        ultimateTurn
      )
  );
  const tutorialFacts: TutorialFacts = {
    status: gameStatus,
    hasPositioned: !!isPlayerPositioned,
    isMyTurn: !!isMyTurn,
    movementPoints: currentCharacter?.movementPoints ?? 0,
    maxMovementPoints: currentCharacter?.maxMovementPoints ?? 0,
    opponentHealth: opponent?.character.health ?? 0,
    peeks,
    canCast,
    opponentIsDummy,
    turnNumber: gameState?.turnNumber ?? 0,
  };
  const wonAgainstBot =
    !!winner &&
    !!bot &&
    // A dummy took its beating without ever raising a hand: that is a lesson,
    // not a win, and it opens nothing in the solo arc.
    !bot.isDummy &&
    !!currentCharacter?.isAlive &&
    !bot.character.isAlive;
  useEffect(() => {
    if (!winner) {
      setSoloResult(null);
      return;
    }
    if (!wonAgainstBot || !content || dreamFight) return;
    // The computer plays a champion in that champion's own set, so the set
    // says who was beaten.
    const beaten = content.champions.find((c) => c.id === botChampion);
    if (!beaten) return;
    const before = beatenChampions(readDefeated(), content.champions);
    markDefeated(beaten.id);
    setSoloResult({
      farewell: { name: beaten.name, line: beaten.lines[1] ?? "" },
      unlocked: before.has(beaten.id)
        ? []
        : unlockedBy(content.champions, beaten.id).map((c) => c.name),
    });
    // Once per result: the bot's snapshot changes every tick, its set does not.
  }, [winner, wonAgainstBot, botChampion, content, dreamFight]);

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

  // The server owns room membership; if we are not in one, go back to the
  // list — or to the dream, between two of its floors.
  useEffect(() => {
    if (!roomId) navigate(dream ? "/dream" : "/lobby", { replace: true });
  }, [roomId, navigate, dream]);

  useEffect(() => {
    if (!character) navigate("/", { replace: true });
  }, [character, navigate]);

  useEffect(() => {
    if (!connected || !roomId || !character) return;
    if (userHasCharacter || characterRequested.current) return;
    // A dream's party is seated by the server, carrying its boons.
    if (dreaming) return;

    // A saved loadout is sent whole once the content says what it resolves
    // to; without the content the server is left to deal its default set.
    if (!content && !contentFailed) return;
    characterRequested.current = true;
    const { messageId, timestamp } = generateMessageId();
    const loadout = settleLoadout(character.loadout, content);
    sendGameAction({
      type: "create_character",
      messageId,
      timestamp,
      character: { ...character, loadout },
    });
  }, [connected, roomId, character, userHasCharacter, sendGameAction, content, contentFailed, dreaming]);

  const act = (action: GameAction) => sendGameAction(action);
  const playing = gameState?.turnOrder.find((id) => gameState.players[id]?.isCurrentTurn);
  const allyTurn = !!playing && playing !== userId && sameSide(gameState?.players, userId, playing);

  const handleSelectedPosition = (position: Position | null) =>
    setSelectedPosition(position);

  const handleSpellClick = (spellId: number) => {
    hapticTap();
    setSelectedSpellId((prev) => (prev === spellId ? null : spellId));
  };

  // A right-click on the board puts a picked spell down, the way a tactics
  // game on a desk lets the mouse take a choice back without travelling to
  // the deck. With nothing picked the browser keeps its own menu.
  const dropOnRightClick = (event: React.MouseEvent) => {
    if (selectedSpellId === null) return;
    event.preventDefault();
    setSelectedSpellId(null);
  };

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

  // Space does whatever the gold button currently does:
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

  // The fight's keyboard (utils/shortcuts.ts): number keys pick a spell,
  // Space — or P, or Tab — does what the gold button does, Escape puts a
  // spell down or opens the menu, L opens the menu and H lists all of it.
  // Keystrokes aimed at the chat are left alone, and so is every key while
  // an overlay is asking its own question.
  const [helpOpen, setHelpOpen] = useState(false);
  const overlayOpen = railOpen || helpOpen || !!leaveAsked || !!winner;
  useEffect(() => {
    // The same order the deck draws its rows in, so key 3 is the third row.
    const catalogue = barSpells(currentPlayer, spellBook);

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
      if (overlayOpen) return;

      const shortcut = shortcutFor(event);
      if (!shortcut) return;
      event.preventDefault();
      // A spell row clicked a moment ago still has the focus, and Space
      // would press it again instead of ending the turn.
      if (target instanceof HTMLElement && target !== document.body) target.blur();

      switch (shortcut.kind) {
        case "spell": {
          const spell = catalogue[shortcut.slot - 1];
          if (!spell) return;
          hapticTap();
          setSelectedSpellId((prev) => (prev === spell.id ? null : spell.id));
          return;
        }
        case "main":
          handleMainButtonKey();
          return;
        case "back":
          if (selectedSpellId !== null) setSelectedSpellId(null);
          else setRailOpen(true);
          return;
        case "menu":
          setRailOpen(true);
          return;
        case "help":
          setHelpOpen(true);
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    spellBook,
    currentPlayer,
    selectedSpellId,
    overlayOpen,
    handleMainButtonKey,
  ]);

  const handlePlayAgain = () => {
    const { messageId, timestamp } = generateMessageId();
    act({ type: "play_again", messageId, timestamp });
    setSelectedPosition(null);
    setSelectedSpellId(null);
  };

  /**
   * What the door out is for. Both ways out of a match leave the room the
   * same way; only one of them asks the lobby for another match on the way
   * through, which is what "Replay tutorial" is — a fresh tutorial fight
   * against a still opponent, not this one with a card laid over it.
   */
  const handleLeave = (intent: LeaveIntent = "lobby") => {
    setLeaveAsked(null);
    if (intent === "tutorial") {
      armTutorialMatch();
      forgetTutorialStep();
    }
    const { messageId, timestamp } = generateMessageId();
    act({ type: "leave_room", messageId, timestamp });
  };

  // Walking out before anyone has fought costs nothing; once the fight is on,
  // it is a forfeit, so the button asks first — whichever door it is.
  const requestLeave = (intent: LeaveIntent = "lobby") => {
    if (
      gameStatus === GAME_STATUS.PLAYING ||
      gameStatus === GAME_STATUS.POSITION_CHARACTERS
    ) {
      setLeaveAsked(intent);
    } else {
      handleLeave(intent);
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
        spellBook?.[String(selectedSpellId)]?.targeting === "self";
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
    const cost = stepCostOf(gameState?.ground);
    const path = findPath(
      from,
      position,
      blockedBy(gameState?.obstacles, occupied, gameState?.terrain, gameState?.ground),
      cost
    );
    if (path && path.length > 0 && pathCost(path, cost) <= currentCharacter.movementPoints) {
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
          <SideSheet
            title={roomName}
            onClose={() => setRailOpen(false)}
            footer={
              <RailExits
                onLeave={() => {
                  setRailOpen(false);
                  requestLeave();
                }}
                onReplayTutorial={() => {
                  setRailOpen(false);
                  requestLeave("tutorial");
                }}
              />
            }
          >
            <RailBody latestGameState={gameState} />
          </SideSheet>
        )}

        {winner && (
          <GameOverModal
            winner={winner}
            onPlayAgain={dreamFight ? undefined : handlePlayAgain}
            onExit={() => handleLeave()}
            farewell={soloResult?.farewell}
            unlocked={soloResult?.unlocked}
            dream={
              dreamFight
                ? {
                    won: !!currentPlayer?.team &&
                      Object.values(gameState?.players ?? {}).some(
                        (p) => p.character.isAlive && p.team === currentPlayer.team
                      ),
                    floor: dream?.floor ?? 0,
                  }
                : undefined
            }
          />
        )}

        {helpOpen && <ShortcutSheet onClose={() => setHelpOpen(false)} />}

        <YourTurnBanner show={gameStatus === GAME_STATUS.PLAYING && !!isMyTurn} />

        {leaveAsked && !winner && (
          <LeaveDialog
            replay={leaveAsked === "tutorial"}
            dream={dreamFight}
            onConfirm={() => handleLeave(leaveAsked)}
            onCancel={() => setLeaveAsked(null)}
          />
        )}

        {/*
          The tour steps aside for anything that asks the player a question of
          its own: dimming the leave confirmation, and talking over it, is the
          overlay forgetting whose turn it is to speak.
        */}
        <GameTutorial
          active={tutorialActive && !leaveAsked}
          facts={tutorialFacts}
          step={tutorialStep}
          onStep={goToTutorialStep}
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
        {/*
          A little lower than the top edge, so the far row clears the turn bar,
          and clear of the command deck on the left: a phone held sideways is
          short before it is narrow, so the board loses almost nothing by
          starting where the deck ends, and no cell hides under a spell.
        */}
        <div id="tutorial-board" onContextMenu={dropOnRightClick} className="absolute bottom-0 left-[min(176px,24vw)] right-0 top-5">
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
              phase={phaseLabel(gameStatus, isMyTurn, allyTurn)}
            />
          </div>
          <div className="pointer-events-auto absolute right-[max(12px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] flex flex-col items-end gap-2">
            <MenuButton onClick={() => setRailOpen(true)} />
            <SpellHint
              player={currentPlayer}
              spells={spellBook}
              selectedSpellId={selectedSpellId}
              onSelectSpell={handleSpellClick}
            />
          </div>
          {/* Flush with the left edge: the deck's spine is the screen's. */}
          <div
            id="tutorial-spellbar"
            className="pointer-events-auto absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-[env(safe-area-inset-left)]"
          >
            <CommandDeck
              player={currentPlayer}
              spells={spellBook}
              selectedSpellId={selectedSpellId}
              onSelectSpell={handleSpellClick}
              turnNumber={ultimateTurn}
              hasRelay={!!relayOf(gameState?.terrain, userId)}
              onPeek={() => setPeeks((n) => n + 1)}
            />
          </div>
          {/*
            The gold disc in the corner, under the right thumb; the portrait,
            which is only ever read, beside it towards the middle.
          */}
          <div className="pointer-events-auto absolute bottom-[max(4px,env(safe-area-inset-bottom))] right-[max(4px,env(safe-area-inset-right))] flex items-end gap-1">
            <div id="tutorial-fighter-panel" className="mb-1">
              <PortraitGauge player={currentPlayer} />
            </div>
            {main && (
              <div id="tutorial-mainbutton">
                <MainAction {...main} turnEndsAt={gameState?.turnEndsAt} timed={gameStatus === GAME_STATUS.PLAYING} />
              </div>
            )}
          </div>
        </div>

        {overlays}
      </div>
    );
  }

  /*
   * A desk: the phone's layout, given room. The board takes everything left
   * of the rail; the deck runs down its left edge with the number keys that
   * pick each spell, and the portrait and the gold button sit bottom right —
   * the same places a thumb finds them, so a player moving between the two
   * never has to learn the screen twice.
   */
  if (wide) {
    const main =
      gameStatus === GAME_STATUS.POSITION_CHARACTERS
        ? {
            label: isPlayerPositioned ? "Waiting…" : "Fight",
            disabled: !connected || !selectedPosition || !!isPlayerPositioned,
            onClick: handleFightClick,
            beckon: connected && !!selectedPosition && !isPlayerPositioned,
          }
        : gameStatus === GAME_STATUS.PLAYING
          ? { label: "End turn", disabled: !isMyTurn, onClick: handleEndTurnClick }
          : null;

    return (
      <div className="relative flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-paper text-ink">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col pl-[env(safe-area-inset-left)]">
          <div className="relative z-10 flex-none px-6 pt-[max(1rem,env(safe-area-inset-top))]">
            <TurnTimeline
              latestGameState={gameState}
              userId={userId}
              onOpenRail={() => setRailOpen(true)}
            />
          </div>
          {/* Starting where the deck ends, so no cell sits under a spell. */}
          <div id="tutorial-board" onContextMenu={dropOnRightClick} className="relative ml-[244px] min-h-0 flex-1 xl:ml-[288px]">
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

          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-auto absolute right-6 top-[88px]">
              <SpellHint
                player={currentPlayer}
                spells={spellBook}
                selectedSpellId={selectedSpellId}
                onSelectSpell={handleSpellClick}
              />
            </div>
            <div
              id="tutorial-spellbar"
              className="pointer-events-auto absolute bottom-4 left-[env(safe-area-inset-left)] origin-bottom-left xl:scale-[1.15]"
            >
              <CommandDeck
                player={currentPlayer}
                spells={spellBook}
                selectedSpellId={selectedSpellId}
                onSelectSpell={handleSpellClick}
                turnNumber={ultimateTurn}
                hasRelay={!!relayOf(gameState?.terrain, userId)}
                onPeek={() => setPeeks((n) => n + 1)}
                shortcuts
                onHelp={() => setHelpOpen(true)}
              />
            </div>
            <div className="pointer-events-auto absolute bottom-3 right-4 flex origin-bottom-right items-end gap-2 xl:scale-[1.15]">
              <div id="tutorial-fighter-panel" className="mb-1">
                <PortraitGauge player={currentPlayer} />
              </div>
              {main && (
                <div id="tutorial-mainbutton">
                  <MainAction {...main} turnEndsAt={gameState?.turnEndsAt} timed={gameStatus === GAME_STATUS.PLAYING} />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden w-[300px] flex-none flex-col border-l border-gold/30 bg-panel/60 pl-5 pr-[calc(1.25rem+env(safe-area-inset-right))] pt-4 lg:flex">
          <SideRail
            roomName={roomName}
            latestGameState={gameState}
            onLeave={() => requestLeave()}
            onReplayTutorial={() => requestLeave("tutorial")}
          />
        </aside>

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
            />
          </div>
          <RotateHint />
          <div id="tutorial-board" onContextMenu={dropOnRightClick} className="relative min-h-0 flex-1">
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
            onLeave={() => requestLeave()}
            onReplayTutorial={() => requestLeave("tutorial")}
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
            spells={spellBook}
            turnNumber={ultimateTurn}
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
              {phaseLabel(gameStatus, isMyTurn, allyTurn)}
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
            {phaseLabel(gameStatus, isMyTurn, allyTurn)}
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
