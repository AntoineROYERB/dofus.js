import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../context/WebSocketContext";
import { generateMessageId } from "../utils/messageUtils";
import { RoomSummary } from "../types/message";
import { readCharacter } from "../utils/characterStorage";

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

const LobbyPage: React.FC = () => {
  const { connected, rooms, roomId, sendGameAction, rejection } =
    useWebSocket();
  const navigate = useNavigate();
  const [newRoomName, setNewRoomName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const character = readCharacter();

  // Pick a character before entering a room; otherwise there is nothing to
  // send once we get there.
  useEffect(() => {
    if (!character) navigate("/", { replace: true });
  }, [character, navigate]);

  // The server decides when we are in a room; the UI just follows it.
  useEffect(() => {
    if (roomId) navigate("/game");
  }, [roomId, navigate]);

  useEffect(() => {
    if (!rejection) return;
    setNotice(rejection.reason);
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [rejection]);

  const createRoom = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({ type: "create_room", messageId, timestamp, name });
    setNewRoomName("");
  };

  // A visitor with no one to play against can still see the whole game.
  const playSolo = () => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({
      type: "create_room",
      messageId,
      timestamp,
      name: `${character?.name ?? "Solo"} vs Cpu`.slice(0, 24),
      withBot: true,
    });
  };

  const joinRoom = (id: string) => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({ type: "join_room", messageId, timestamp, roomId: id });
  };

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

        <button
          type="button"
          onClick={playSolo}
          disabled={!connected}
          className="mt-5 w-full bg-vermilion px-4 py-4 font-display text-[16px] font-bold text-white sm:mt-6 sm:py-3.5 transition-colors hover:bg-[#b93a25] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted"
        >
          Play against the computer
        </button>

        <div className="mt-7 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-label text-muted">
          <span className="h-px flex-1 bg-rule" />
          or wait for someone
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form onSubmit={createRoom} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Name your game"
            aria-label="Name your game"
            maxLength={24}
            className="h-12 min-w-0 flex-1 border border-rule bg-board px-3 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none sm:h-11 sm:text-[14px]"
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

        <button
          type="button"
          onClick={() => navigate("/")}
          className="my-4 self-start font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
        >
          Change character
        </button>
      </div>
    </div>
  );
};

export default LobbyPage;
