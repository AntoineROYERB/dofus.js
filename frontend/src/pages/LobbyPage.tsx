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
import {
  beatenChampions,
  isUnlocked,
  kitOf,
  nextChallenge,
  settleLoadout,
} from "../utils/loadoutUtils";
import { Champion, ContentResponse } from "../types/message";
import { Wardrobe } from "../components/Game/Wardrobe";
import { HomeMode, LobbyHome } from "../components/Lobby/LobbyHome";
import { HomeIcon, ICONS } from "../components/Lobby/homeIcons";
import { ModeCard, ModeId, ModePicker } from "../components/Lobby/ModePicker";
import { RenameDialog } from "../components/Lobby/RenameDialog";
import { SideSheet } from "../components/Overlay";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { ElementGlyph } from "../components/Game/ElementGlyph";
import {
  armTutorialMatch,
  hasSeenTutorial,
  isTutorialMatchArmed,
} from "../utils/tutorialStorage";
import { Key, t } from "../i18n/lang";
import { useT } from "../i18n/LanguageProvider";
import { Modal } from "../components/Overlay";
import { OptionsPanel } from "../components/OptionsPanel";
import { useMusic } from "../audio/useSound";

/**
 * One rung of the solo arc: a champion, and whether it can be fought yet.
 * Locked rungs still show who they are and what opens them, so the arc reads
 * as somewhere to go rather than a row of padlocks. Beating a champion wins
 * its set.
 */
const OpponentRow: React.FC<{
  champion: Champion;
  content: ContentResponse;
  defeated: ReadonlySet<string>;
  disabled: boolean;
  onChallenge: (championId: string) => void;
  /**
   * On the home screen a row picks the opponent Play will start against,
   * rather than starting the fight itself. Undefined means "fight now".
   */
  picked?: boolean;
}> = ({ champion, content, defeated, disabled, onChallenge, picked }) => {
  const open = isUnlocked(champion, defeated);
  const beaten = defeated.has(champion.id);
  const opener = content.champions.find((c) => c.id === champion.unlockedBy);
  const kit = kitOf(champion.set, content);

  return (
    <li className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <span aria-hidden className="grid w-6 flex-none place-items-center text-[17px] text-muted">
        {open ? <ElementGlyph element={kit?.element} size={16} /> : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-display text-[15px] font-bold ${open ? "" : "text-muted"}`}>
          {champion.name}
        </p>
        <p className="truncate font-mono text-[9.5px] uppercase tracking-label text-muted">
          {kit?.grimoire.name}
          {beaten ? ` · ${t("set won")}` : ""}
          {!open && opener ? ` · ${t("beat {name} first", { name: opener.name })}` : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled || !open}
        onClick={() => onChallenge(champion.id)}
        className="rounded-full border border-ink px-4 py-2.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted sm:py-1.5"
      >
        {!open
          ? t("Locked")
          : picked === undefined
            ? t("Fight")
            : picked
              ? t("Picked")
              : t("Pick")}
      </button>
    </li>
  );
};

const statusLabel: Record<string, Key> = {
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
          {room.status in statusLabel ? t(statusLabel[room.status]) : room.status}
        </p>
      </div>
      <span className="font-mono text-[12px] tabular-nums text-graphite">
        {room.players}/{room.maxPlayers}
      </span>
      <button
        type="button"
        disabled={closed}
        onClick={() => onJoin(room.id)}
        className="rounded-full border border-ink px-4 py-2.5 font-mono text-[10px] uppercase tracking-label text-ink sm:py-1.5 transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        {full ? t("Full") : started ? t("Started") : t("Join")}
      </button>
    </li>
  );
};

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
  useMusic("overworld");
  const { connected, rooms, roomId, sendGameAction, rejection, dream } =
    useWebSocket();
  // Endless Dreams opens once the tutorial has been played.
  const dreamsOpen = hasSeenTutorial() || !!dream;
  const navigate = useNavigate();
  useT();
  const [newRoomName, setNewRoomName] = useState("");
  const [roomNameFocused, setRoomNameFocused] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const notice = useRejectionBanner(rejection);

  const character = readCharacter();
  const { content, failed: contentFailed } = useContent();
  const champions = content?.champions ?? [];
  const islands = content?.islands ?? [];
  const loadout = settleLoadout(character?.loadout, content);
  const [island, setIsland] = useState(islandFromUrl);
  // Read on every render: coming back from a won match has to show the rung
  // it opened without a reload.
  const defeated = beatenChampions(readDefeated(), champions);
  const next = champions.length > 0 ? nextChallenge(champions, defeated) : undefined;

  // A phone held sideways — the iOS app — gets the home screen instead of
  // the list; the list lives on in its sheets.
  const homeScreen = useMediaQuery("(max-height: 560px)");
  const [sheet, setSheet] = useState<"opponents" | "rooms" | "modes" | "menu" | "options" | null>(null);
  // What Play starts on the home screen. A dream under way is picked back up.
  const [mode, setMode] = useState<ModeId>(() => (dream && dream.phase !== "over" ? "dreams" : "duel"));
  // The opponent Play starts against: the arc's next one unless picked.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The character lives in storage; bumping this re-reads it after an edit.
  const [, setEdits] = useState(0);
  const picked =
    champions.find((c) => c.id === pickedId && isUnlocked(c, defeated)) ?? next;

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
   * no champion list to hand the server picks the opponent, as it always did.
   *
   * The tutorial's opponent stands still until the tour ends: nobody learns
   * which button is which while being shot at. It wakes up on the way out.
   */
  const playSolo = (botChampion?: string, asked = false) => {
    const opponent = champions.find((c) => c.id === botChampion)?.name;
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
      ...(botChampion ? { botChampion } : {}),
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

  const opponentList = (pick: boolean) =>
    content && (
    <ul>
      {champions.map((champion) => (
        <OpponentRow
          key={champion.id}
          champion={champion}
          content={content}
          defeated={defeated}
          disabled={!connected}
          onChallenge={
            pick
              ? (id) => {
                  setPickedId(id);
                  setMode("duel");
                  setSheet(null);
                }
              : playSolo
          }
          picked={pick ? champion.id === picked?.id : undefined}
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
          placeholder={t("Name your game")}
          aria-label={t("Name your game")}
          maxLength={24}
          className={`h-12 min-w-0 flex-1 rounded-full border bg-board px-4 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none sm:h-11 sm:text-[14px] ${
            newRoomName.length === 0 && !roomNameFocused
              ? "animate-hint"
              : "border-rule"
          }`}
        />
        <button
          type="submit"
          disabled={!connected || newRoomName.trim().length < 3}
          className="rounded-full h-12 flex-none border border-ink bg-ink px-5 font-mono text-[10px] uppercase tracking-label text-paper transition-colors disabled:cursor-not-allowed disabled:border-hairline disabled:bg-transparent disabled:text-muted sm:h-11"
        >
          {t("Create")}
        </button>
      </form>

      <div className="mb-1.5 mt-8 font-mono text-[9.5px] uppercase tracking-label text-muted">
        {t("Open games")}
      </div>
      <section className="flex-1 border-t border-ink">
        {rooms.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">
            {t("No games open yet. Create one and wait for an opponent.")}
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

  const wardrobe = wardrobeOpen && character && (
    <Wardrobe
      content={content}
      failed={contentFailed}
      loadout={loadout}
      color={character.color}
      name={character.name}
      onSave={(chosen) => {
        saveCharacter(character.name, character.color, chosen);
        setWardrobeOpen(false);
        setEdits((n) => n + 1);
      }}
      onCancel={() => setWardrobeOpen(false)}
    />
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
    const dreaming = !!dream && dream.phase !== "over";
    const rivalElement = kitOf(picked?.set, content)?.element;
    const homeMode: HomeMode =
      mode === "dreams"
        ? { label: t("Endless Dreams"), title: dreaming ? t("Floor {n}", { n: Math.max(1, dream?.floor ?? 1) }) : t("Climb the dream"), icon: "dream" }
        : mode === "rooms"
          ? { label: t("With friends"), title: joinable > 0 ? t("{n} open", { n: joinable }) : t("Open a room"), icon: "games" }
          : { label: t("Duel"), title: picked?.name ?? t("Computer opponent"), icon: "swords", element: rivalElement };
    const modeCards: ModeCard[] = [
      {
        id: "duel",
        name: t("Duel"),
        line: t("One against one, against a rival. Beat them all to climb."),
        icon: "swords",
        element: rivalElement,
      },
      {
        id: "dreams",
        name: t("Endless Dreams"),
        line: t("Floor after floor, alone or up to three. Boons between floors."),
        icon: "dream",
        locked: dreamsOpen ? undefined : t("Opens once the tutorial is played."),
        badge: dreaming ? "on" : undefined,
      },
      {
        id: "rooms",
        name: t("With friends"),
        line: t("Open a room or join one, and fight another player."),
        icon: "games",
        badge: joinable > 0 ? t("{n} open", { n: joinable }) : undefined,
      },
    ];
    const menuItems: { label: string; icon: HomeIcon; onClick: () => void }[] = [
      { label: t("How to play"), icon: "help", onClick: () => setHowToPlayOpen(true) },
      { label: t("Match history"), icon: "history", onClick: () => navigate("/matches") },
      { label: t("Dream leaderboard"), icon: "trophy", onClick: () => navigate("/dreams/leaderboard") },
      { label: t("Open world"), icon: "world", onClick: () => navigate("/explore") },
      { label: t("Change character"), icon: "user", onClick: () => navigate("/") },
      { label: t("Options"), icon: "options", onClick: () => setSheet("options") },
    ];
    return (
      <>
        <LobbyHome
          character={character}
          content={content}
          loadout={loadout}
          connected={connected}
          notice={notice}
          beaten={defeated.size}
          rivals={champions.length}
          mode={homeMode}
          canPlay={mode === "duel" ? connected : true}
          onPlay={() => {
            if (mode === "dreams") navigate("/dream");
            else if (mode === "rooms") setSheet("rooms");
            else playSolo(picked?.id);
          }}
          onRename={() => setRenaming(true)}
          onOpenWardrobe={() => setWardrobeOpen(true)}
          onOpenModes={() => setSheet("modes")}
          onOpenRivals={() => setSheet("opponents")}
          onOpenMenu={() => setSheet("menu")}
        />
        {sheet === "modes" && (
          <ModePicker
            modes={modeCards}
            selected={mode}
            rival={picked ? { name: picked.name, element: kitOf(picked.set, content)?.element } : undefined}
            onSelect={(id) => {
              setMode(id);
              setSheet(null);
            }}
            onChangeRival={() => setSheet("opponents")}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "menu" && (
          <SideSheet title={t("Menu")} width="w-[min(340px,88vw)]" onClose={() => setSheet(null)}>
            <nav aria-label={t("Menu")} className="mt-3 flex flex-col gap-2">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    item.onClick();
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-panel/80 px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgb(var(--rule))] transition-transform active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-board text-gold">
                    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICONS[item.icon]} />
                    </svg>
                  </span>
                  <span className="font-display text-[16px]">{item.label}</span>
                </button>
              ))}
            </nav>
          </SideSheet>
        )}
        {sheet === "options" && (
          <SideSheet title={t("Options")} width="w-[min(340px,88vw)]" onClose={() => setSheet(null)}>
            <OptionsPanel />
          </SideSheet>
        )}
        {sheet === "opponents" && (
          <SideSheet title={t("Rivals")} width="w-[min(420px,92vw)]" onClose={() => setSheet(null)}>
            {opponentList(true)}
          </SideSheet>
        )}
        {sheet === "rooms" && (
          <SideSheet title={t("Rooms")} width="w-[min(420px,92vw)]" onClose={() => setSheet(null)}>
            {roomsPanel}
          </SideSheet>
        )}
        {renaming && (
          <RenameDialog
            name={character.name}
            onSave={(name) => {
              saveCharacter(name, character.color, character.loadout);
              setRenaming(false);
              setEdits((n) => n + 1);
            }}
            onCancel={() => setRenaming(false)}
          />
        )}
        {howToPlay}
        {wardrobe}
      </>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Dofus.js · {t("lobby")}
          </span>
          <span className="flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-label text-muted">
            <b className="font-medium text-ink">{character?.name}</b>
            <span className={connected ? "" : "text-vermilion"}>
              {connected ? t("connected") : t("reconnecting…")}
            </span>
          </span>
        </div>

        <h1 className="mt-6 font-display text-[clamp(2rem,9vw,2.6rem)] font-bold leading-none tracking-tight sm:mt-7">
          {t("Find a game")}
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
          className={`mt-5 w-full btn-gold px-4 py-4 font-display text-[16px] font-bold sm:mt-6 sm:py-3.5 disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted ${
            connected ? "animate-beckon" : ""
          }`}
        >
          {next ? t("Challenge {name}", { name: next.name }) : t("Play against the computer")}
        </button>
        {next && (
          <p className="mt-2 text-center text-[13px] italic text-graphite">
            “{next.lines[0]}”
          </p>
        )}

        {/*
          Where the fight is. Until the campaign map chooses for you, this is
          how a fight on an island — and its ground — is opened.
        */}
        {islands.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t("Fight on")}>
            <span className="mr-1 font-mono text-[9.5px] uppercase tracking-label text-muted">{t("Fight on")}</span>
            {[{ id: "", name: t("Arena") }, ...islands].map((i) => (
              <button
                key={i.id || "arena"}
                type="button"
                role="radio"
                aria-checked={island === i.id}
                onClick={() => setIsland(i.id)}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors ${
                  island === i.id
                    ? "border-gold bg-gold text-[#2a1b00]"
                    : "border-hairline text-graphite hover:border-ink"
                }`}
              >
                {i.name}
              </button>
            ))}
          </div>
        )}

        {/*
          The climb, once the tutorial has taught the buttons. A dream under
          way is picked back up from here too.
        */}
        <button
          type="button"
          onClick={() => navigate("/dream")}
          disabled={!dreamsOpen}
          className="mt-3 flex w-full items-baseline justify-between rounded-2xl border border-gold/60 bg-panel/60 px-4 py-3 text-left transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent"
        >
          <span className="font-display text-[16px] font-bold">
            {dream && dream.phase !== "over" ? t("Back to your dream") : t("Endless Dreams")}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-label">
            {!dreamsOpen
              ? t("after the tutorial")
              : dream && dream.phase !== "over"
                ? t("floor {n}", { n: Math.max(1, dream.floor) })
                : t("up to 3 players")}
          </span>
        </button>

        {champions.length > 1 && (
          <details className="mt-3 border-t border-hairline">
            <summary className="cursor-pointer py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion">
              {t("Every champion · {beaten}/{total} beaten", { beaten: defeated.size, total: champions.length })}
            </summary>
            {opponentList(false)}
          </details>
        )}

        <div className="mt-7 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-label text-muted">
          <span className="h-px flex-1 bg-rule" />
          {t("or wait for someone")}
          <span className="h-px flex-1 bg-rule" />
        </div>

        {roomsPanel}

        {/*
          Each link whole on its line: squeezed into one row on a phone, they
          broke into stacks of single words that read as separate buttons.
        */}
        <div className="my-3 flex flex-wrap gap-x-5">
          <button
            type="button"
            onClick={() => setHowToPlayOpen(true)}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("How to play")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/explore")}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Open world")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/matches")}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Match history")}
          </button>
          <button
            type="button"
            onClick={() => setWardrobeOpen(true)}
            disabled={!content}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Wardrobe")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Change character")}
          </button>
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            className="self-start whitespace-nowrap py-2 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Options")}
          </button>
        </div>
      </div>

      {optionsOpen && (
        <Modal
          onClose={() => setOptionsOpen(false)}
          labelledBy="options-title"
          className="max-w-xs rounded-3xl border-2 border-gold/70 bg-paper p-5"
        >
          <h2 id="options-title" className="pr-10 font-display text-[22px] leading-none">
            {t("Options")}
          </h2>
          <OptionsPanel />
        </Modal>
      )}
      {howToPlay}
      {wardrobe}
    </div>
  );
};

export default LobbyPage;
