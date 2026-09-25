import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../context/WebSocketContext";
import { generateMessageId } from "../utils/messageUtils";
import { RoomSummary } from "../types/message";
import { readCharacter, saveCharacter } from "../utils/characterStorage";
import { useRejectionBanner } from "../hooks/useRejectionBanner";
import { HowToPlayDialog } from "../components/HowToPlayDialog";
import { useContent } from "../hooks/useContent";
import { readDefeated } from "../utils/progressStorage";
import { isUnlocked, nextChallenge } from "../utils/classUtils";
import { CharacterClass } from "../types/message";
import { LobbyHome } from "../components/Lobby/LobbyHome";
import { RenameDialog } from "../components/Lobby/RenameDialog";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  armTutorialMatch,
  hasSeenTutorial,
  isTutorialMatchArmed,
} from "../utils/tutorialStorage";

/**
 * One rung of the solo arc: an opponent, and whether it can be fought yet.
 * Locked rungs still show who they are and what opens them, so the arc reads
 * as somewhere to go rather than a row of padlocks.
 */
const OpponentRow: React.FC<{
  cls: CharacterClass;
  classes: CharacterClass[];
  defeated: ReadonlySet<string>;
  disabled: boolean;
  onChallenge: (classId: string) => void;
  /**
   * On the home screen a row picks the opponent Play will start against,
   * rather than starting the fight itself. Undefined means "fight now".
   */
  picked?: boolean;
}> = ({ cls, classes, defeated, disabled, onChallenge, picked }) => {
  const open = isUnlocked(cls, defeated);
  const beaten = defeated.has(cls.id);
  const opener = classes.find((c) => c.id === cls.unlockedBy);

  return (
    <li className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span aria-hidden className="w-6 flex-none text-center text-[17px]">
        {open ? cls.symbol : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-display text-[15px] font-bold ${open ? "" : "text-muted"}`}>
          {cls.opponent.name}
        </p>
        <p className="truncate font-mono text-[9.5px] uppercase tracking-label text-muted">
          {cls.name}
          {beaten ? " · beaten" : ""}
          {!open && opener ? ` · beat ${opener.opponent.name} first` : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled || !open}
        onClick={() => onChallenge(cls.id)}
        className="border border-ink px-4 py-2.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted sm:py-1.5"
      >
        {!open
          ? "Locked"
          : picked === undefined
            ? "Fight"
            : picked
              ? "Picked"
              : "Pick"}
      </button>
    </li>
  );
};

const statusLabel: Record<string, string> = {
  creating_player: "Waiting for players",
  position_characters: "Placing characters",
  playing: "In progress",
  game_over: "Finished",
};

const RoomRow: React.FC<{
  room: RoomSummary;
  onJoin: (roomId: string) => void;
}> = ({ room, onJoin }) => {
  const full = room.players >= room.maxPlayers;
  const started = room.status !== "creating_player";
  const closed = full || started;

  return (
    <li className="flex items-center gap-4 border-b border-hairline py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] font-bold">
          {room.name}
        </p>
        <p className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          {statusLabel[room.status] ?? room.status}
        </p>
      </div>
      <span className="font-mono text-[12px] tabular-nums text-graphite">
        {room.players}/{room.maxPlayers}
      </span>
      <button
        type="button"
        disabled={closed}
        onClick={() => onJoin(room.id)}
        className="border border-ink px-4 py-2.5 font-mono text-[10px] uppercase tracking-label text-ink sm:py-1.5 transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        {full ? "Full" : started ? "Started" : "Join"}
      </button>
    </li>
  );
};

/** A panel sliding in from the right, over the home screen. */
const Sheet: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-40">
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="absolute inset-0 bg-ink/40"
    />
    <aside
      role="dialog"
      aria-label={title}
      className="absolute bottom-0 right-0 top-0 flex w-[min(420px,92vw)] flex-col border-l-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] pl-5 pr-[calc(1.25rem+env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div className="flex flex-none items-baseline justify-between border-b-2 border-ink pb-1.5">
        <span className="font-display text-[17px] font-bold">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">{children}</div>
    </aside>
  </div>
);

/**
 * The island a solo match starts on, from `?island=ice` on the lobby's URL.
 * Until the campaign map picks the island, the lobby lets you pick it; this
 * is only where that choice starts. Empty is a plain arena.
 */
const islandFromUrl = (): string => {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("island")?.trim() ?? "";
};

const LobbyPage: React.FC = () => {
  const { connected, rooms, roomId, sendGameAction, rejection } =
    useWebSocket();
  const navigate = useNavigate();
  const [newRoomName, setNewRoomName] = useState("");
  const [roomNameFocused, setRoomNameFocused] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const notice = useRejectionBanner(rejection);

  const character = readCharacter();
  const { content, failed: contentFailed } = useContent();
  const classes = content?.classes ?? [];
  const islands = content?.islands ?? [];
  const [island, setIsland] = useState(islandFromUrl);
  // Read on every render: coming back from a won match has to show the rung
  // it opened without a reload.
  const defeated = readDefeated();
  const next = classes.length > 0 ? nextChallenge(classes, defeated) : undefined;

  // A phone held sideways — the iOS app — gets the home screen instead of
  // the list; the list lives on in its sheets.
  const homeScreen = useMediaQuery("(max-height: 560px)");
  const [sheet, setSheet] = useState<"opponents" | "rooms" | null>(null);
  // The opponent Play starts against: the arc's next one unless picked.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  // The character lives in storage; bumping this re-reads it after an edit.
  const [, setEdits] = useState(0);
  const picked =
    classes.find(
      (c) => c.id === pickedId && isUnlocked(c, defeated)
    ) ?? next;

  // Pick a character before entering a room; otherwise there is nothing to
  // send once we get there.
  useEffect(() => {
    if (!character) navigate("/", { replace: true });
  }, [character, navigate]);

  // The server decides when we are in a room; the UI just follows it.
  useEffect(() => {
    if (roomId) navigate("/game");
  }, [roomId, navigate]);

  const createRoom = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({ type: "create_room", messageId, timestamp, name });
    setNewRoomName("");
  };

  /*
   * A visitor with no one to play against can still see the whole game. With
   * no class list to hand the server picks the opponent, as it always did.
   *
   * The tutorial's opponent stands still until the tour ends: nobody learns
   * which button is which while being shot at. It wakes up on the way out.
   */
  const playSolo = (botClass?: string, asked = false) => {
    const opponent = classes.find((c) => c.id === botClass)?.opponent.name;
    /*
     * Any solo match a player opens before they have seen the tour is a
     * tutorial match, whichever button opened it: the game screen shows the
     * tour to anyone who has not seen it, and showing it over an opponent
     * that fights back is the thing this was meant to stop. Asked for by
     * name, or first time out — same still opponent either way.
     */
    const still = asked || !hasSeenTutorial();
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "create_room",
      messageId,
      timestamp,
      name: `${character?.name ?? "Solo"} vs ${opponent ?? "Cpu"}`.slice(0, 24),
      withBot: true,
      ...(botClass ? { botClass } : {}),
      ...(still ? { botMode: "dummy" as const } : {}),
      ...(island ? { island } : {}),
    });
  };

  // "Play the tutorial" was pressed on the landing page, which has no socket
  // to open a match on. This is where that request is answered — once the
  // opponent list has arrived, so the tour starts against the arc's next
  // rival rather than against whoever the server happens to deal.
  // Once per connection, not once per lifetime: a request sent on a socket
  // that is closing goes nowhere and says nothing, and the player is left in
  // the lobby wondering what became of the button they pressed. Asking again
  // on the next connection cannot open a second room, since a room of our own
  // stops it.
  const askedOnThisSocket = useRef(false);
  useEffect(() => {
    if (!connected) {
      askedOnThisSocket.current = false;
      return;
    }
    if (roomId || askedOnThisSocket.current) return;
    if (!isTutorialMatchArmed()) return;
    if (!content && !contentFailed) return;
    askedOnThisSocket.current = true;
    playSolo(picked?.id, true);
    // playSolo reads the character and the socket, both stable for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, roomId, content, contentFailed, picked?.id]);

  const startTutorial = () => {
    armTutorialMatch();
    setHowToPlayOpen(false);
    playSolo(picked?.id, true);
  };

  const joinRoom = (id: string) => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({ type: "join_room", messageId, timestamp, roomId: id });
  };

  const opponentList = (pick: boolean) => (
    <ul>
      {classes.map((cls) => (
        <OpponentRow
          key={cls.id}
          cls={cls}
          classes={classes}
          defeated={defeated}
          disabled={!connected}
          onChallenge={
            pick
              ? (id) => {
                  setPickedId(id);
                  setSheet(null);
                }
              : playSolo
          }
          picked={pick ? cls.id === picked?.id : undefined}
        />
      ))}
    </ul>
  );

  const roomsPanel = (
    <>
      <form onSubmit={createRoom} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onFocus={() => setRoomNameFocused(true)}
          onBlur={() => setRoomNameFocused(false)}
          placeholder="Name your game"
          aria-label="Name your game"
          maxLength={24}
          className={`h-12 min-w-0 flex-1 border bg-board px-3 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none sm:h-11 sm:text-[14px] ${
            newRoomName.length === 0 && !roomNameFocused
              ? "animate-hint"
              : "border-rule"
          }`}
        />
        <button
          type="submit"
          disabled={!connected || newRoomName.trim().length < 3}
          className="h-12 flex-none border border-ink bg-ink px-5 font-mono text-[10px] uppercase tracking-label text-paper transition-colors disabled:cursor-not-allowed disabled:border-hairline disabled:bg-transparent disabled:text-muted sm:h-11"
        >
          Create
        </button>
      </form>

      <div className="mb-1.5 mt-8 font-mono text-[9.5px] uppercase tracking-label text-muted">
        Open games
      </div>
      <section className="flex-1 border-t border-ink">
        {rooms.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">
            No games open yet. Create one and wait for an opponent.
          </p>
        ) : (
          <ul>
            {rooms.map((room) => (
              <RoomRow key={room.id} room={room} onJoin={joinRoom} />
            ))}
          </ul>
        )}
      </section>
    </>
  );

  const howToPlay = (
    <HowToPlayDialog
      open={howToPlayOpen}
      onClose={() => setHowToPlayOpen(false)}
      onPlayTutorial={connected ? startTutorial : undefined}
    />
  );

  if (homeScreen && character) {
    const joinable = rooms.filter(
      (r) => r.status === "creating_player" && r.players < r.maxPlayers
    ).length;
    return (
      <>
        <LobbyHome
          character={character}
          classes={classes}
          connected={connected}
          notice={notice}
          opponent={picked}
          beaten={classes.filter((c) => defeated.has(c.id)).length}
          openRooms={joinable}
          onPlay={() => playSolo(picked?.id)}
          onRename={() => setRenaming(true)}
          onSelectClass={(cls) => {
            // The fighter wears its class's colour.
            saveCharacter(character.name, cls.palette.primary, cls.id);
            setEdits((n) => n + 1);
          }}
          onOpenOpponents={() => setSheet("opponents")}
          onOpenRooms={() => setSheet("rooms")}
          onOpenHistory={() => navigate("/matches")}
          onOpenHelp={() => setHowToPlayOpen(true)}
        />
        {sheet === "opponents" && (
          <Sheet title="Rivals" onClose={() => setSheet(null)}>
            {opponentList(true)}
          </Sheet>
        )}
        {sheet === "rooms" && (
          <Sheet title="Rooms" onClose={() => setSheet(null)}>
            {roomsPanel}
          </Sheet>
        )}
        {renaming && (
          <RenameDialog
            name={character.name}
            onSave={(name) => {
              saveCharacter(name, character.color, character.class);
              setRenaming(false);
              setEdits((n) => n + 1);
            }}
            onCancel={() => setRenaming(false)}
          />
        )}
        {howToPlay}
      </>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Dofus.js · lobby
          </span>
          <span className="flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-label text-muted">
            <span
              aria-hidden
              className="h-[9px] w-[9px] flex-none translate-y-px"
              style={{ backgroundColor: character?.color }}
            />
            <b className="font-medium text-ink">{character?.name}</b>
            <span className={connected ? "" : "text-vermilion"}>
              {connected ? "connected" : "reconnecting…"}
            </span>
          </span>
        </div>

        <h1 className="mt-6 font-display text-[clamp(2rem,9vw,2.6rem)] font-bold leading-none tracking-tight sm:mt-7">
          Find a game
        </h1>

        {notice && (
          <p
            role="status"
            className="mt-4 border-l-2 border-vermilion bg-panel py-2 pl-3 text-[13px] text-vermilion"
          >
            {notice}
          </p>
        )}

        {/*
          Two ways in, and nothing on the page says which to take. Each
          pulses its own way of asking — a ring around the one-click path, a
          border around the one that wants typing — so the choice is felt
          rather than read.
        */}
        <button
          type="button"
          onClick={() => playSolo(next?.id)}
          disabled={!connected}
          className={`mt-5 w-full bg-vermilion px-4 py-4 font-display text-[16px] font-bold text-white sm:mt-6 sm:py-3.5 transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted ${
            connected ? "animate-beckon" : ""
          }`}
        >
          {next ? `Challenge ${next.opponent.name}` : "Play against the computer"}
        </button>
        {next && (
          <p className="mt-2 text-center text-[13px] italic text-graphite">
            “{next.opponent.lines[0]}”
          </p>
        )}

        {/*
          Where the fight is. Until the campaign map chooses for you, this is
          how a fight on an island — and its ground — is opened.
        */}
        {islands.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Fight on">
            <span className="mr-1 font-mono text-[9.5px] uppercase tracking-label text-muted">Fight on</span>
            {[{ id: "", name: "Arena" }, ...islands].map((i) => (
              <button
                key={i.id || "arena"}
                type="button"
                role="radio"
                aria-checked={island === i.id}
                onClick={() => setIsland(i.id)}
                className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors ${
                  island === i.id
                    ? "border-ink bg-ink text-paper"
                    : "border-hairline text-graphite hover:border-ink"
                }`}
              >
                {i.name}
              </button>
            ))}
          </div>
        )}

        {classes.length > 1 && (
          <details className="mt-3 border-t border-hairline">
            <summary className="cursor-pointer py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion">
              Every opponent · {classes.filter((c) => defeated.has(c.id)).length}/
              {classes.length} beaten
            </summary>
            {opponentList(false)}
          </details>
        )}

        <div className="mt-7 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-label text-muted">
          <span className="h-px flex-1 bg-rule" />
          or wait for someone
          <span className="h-px flex-1 bg-rule" />
        </div>

        {roomsPanel}

        <div className="my-4 flex gap-5">
          <button
            type="button"
            onClick={() => setHowToPlayOpen(true)}
            className="self-start font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            How to play
          </button>
          <button
            type="button"
            onClick={() => navigate("/explore")}
            className="self-start font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Open world
          </button>
          <button
            type="button"
            onClick={() => navigate("/matches")}
            className="self-start font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Match history
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="self-start font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Change character
          </button>
        </div>
      </div>

      {howToPlay}
    </div>
  );
};

export default LobbyPage;
