import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../context/WebSocketContext";
import { generateMessageId } from "../utils/messageUtils";
import StarryBackground from "../components/StarryBackground";
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
    <li className="flex items-center gap-4 py-3 border-b border-white/10 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{room.name}</p>
        <p className="text-xs text-gray-400">
          {statusLabel[room.status] ?? room.status}
        </p>
      </div>
      <span className="text-sm text-gray-300 tabular-nums">
        {room.players}/{room.maxPlayers}
      </span>
      <button
        type="button"
        disabled={closed}
        onClick={() => onJoin(room.id)}
        className="px-4 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium transition hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
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

  const joinRoom = (id: string) => {
    const { messageId, timestamp } = generateMessageId();
    sendGameAction({ type: "join_room", messageId, timestamp, roomId: id });
  };

  return (
    <div className="relative min-h-screen overflow-y-auto bg-[#05060a] text-white">
      <StarryBackground />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-14 flex flex-col gap-8">
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Games</h1>
            <p className="text-sm text-gray-400">
              Playing as{" "}
              <span style={{ color: character?.color }}>{character?.name}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full ${
              connected
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-red-500/15 text-red-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            {connected ? "Connected" : "Reconnecting…"}
          </span>
        </header>

        {notice && (
          <div
            role="status"
            className="rounded-md bg-red-600/90 px-4 py-2 text-sm"
          >
            {notice}
          </div>
        )}

        <form onSubmit={createRoom} className="flex gap-2">
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Name your game"
            aria-label="Name your game"
            maxLength={24}
            className="flex-1 h-11 px-4 rounded-md bg-white/5 border border-white/15 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!connected || newRoomName.trim().length < 3}
            className="px-5 h-11 rounded-md bg-emerald-600 font-medium transition hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </form>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2">
          {rooms.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
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
          className="self-start text-sm text-gray-400 underline underline-offset-4 hover:text-gray-200"
        >
          Change character
        </button>
      </div>
    </div>
  );
};

export default LobbyPage;
