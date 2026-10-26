import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../context/WebSocketContext";
import { useContent } from "../hooks/useContent";
import { useRejectionBanner } from "../hooks/useRejectionBanner";
import { readCharacter } from "../utils/characterStorage";
import { kitOf, settleLoadout } from "../utils/loadoutUtils";
import { generateMessageId } from "../utils/messageUtils";
import { GameAction } from "../types/game";
import {
  ContentResponse,
  DreamBoon,
  DreamRoom,
  DreamView,
  Rarity,
} from "../types/message";
import { CreaturePortrait } from "../components/Dream/CreaturePortrait";
import { ElementGlyph } from "../components/Game/ElementGlyph";
import { hasSeenTutorial } from "../utils/tutorialStorage";
import { t, tn } from "../i18n/lang";

/*
 * Endless Dreams, between fights: making a party, choosing a floor's room,
 * taking a boon, and reading how far the climb went. The fights themselves
 * are the game screen's; the server moves the party there and back.
 */

type Send = (action: GameAction) => void;

const withId = <T extends object>(action: T) => ({ ...generateMessageId(), ...action });

const RARITY_PIPS: Record<Rarity, number> = { common: 1, rare: 2, legendary: 3 };

/** A boon's rarity as pips and a word, never as a colour alone. */
const RarityMark: React.FC<{ rarity: Rarity }> = ({ rarity }) => (
  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-label text-muted">
    {[1, 2, 3].map((n) => (
      <span
        key={n}
        aria-hidden
        className={`h-[6px] w-[6px] border border-ink ${n <= RARITY_PIPS[rarity] ? "bg-ink" : ""}`}
      />
    ))}
    {rarity}
  </span>
);

const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`font-mono text-[9.5px] uppercase tracking-label text-muted ${className}`}>{children}</div>
);

const boonOf = (content: ContentResponse | null, id: string): DreamBoon | undefined =>
  content?.dream?.boons.find((b) => b.id === id);

const islandName = (content: ContentResponse | null, id: string) =>
  content?.islands.find((i) => i.id === id)?.name ?? id;

// ---------------------------------------------------------------------------
// Before a run: open a party, or join one
// ---------------------------------------------------------------------------

const Door: React.FC<{ connected: boolean; send: Send; content: ContentResponse | null }> = ({
  connected,
  send,
  content,
}) => {
  const [code, setCode] = useState("");
  const character = readCharacter();
  const look = character && { ...character, loadout: settleLoadout(character.loadout, content) };
  const navigate = useNavigate();

  return (
    <div className="mt-5 grid gap-6 sm:grid-cols-2 short:mt-3 short:gap-4">
      <section className="border-t-2 border-ink pt-3">
        <Label>{t("Alone or with friends")}</Label>
        <p className="mt-2 text-[14px] text-graphite">
          {t("Climb as far as you can. Each floor offers three rooms; the deeper the dream, the more there is in them. Every fifth floor, a ruler waits. Up to three can climb together.")}
        </p>
        <button
          type="button"
          disabled={!connected || !look}
          onClick={() => look && send(withId({ type: "dream_create" as const, character: look }))}
          className="mt-4 w-full btn-gold px-4 py-3.5 font-display text-[16px] font-bold disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted"
        >
          {t("Open a party")}
        </button>
      </section>
      <section className="border-t-2 border-ink pt-3">
        <Label>{t("Join a party")}</Label>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (look && code.trim()) send(withId({ type: "dream_join" as const, code: code.trim(), character: look }));
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("Party code")}
            aria-label={t("Party code")}
            maxLength={8}
            className="rounded-full h-12 min-w-0 flex-1 border border-rule bg-board px-3 font-mono text-[15px] uppercase tracking-label text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={!connected || code.trim().length < 4}
            className="rounded-full h-12 flex-none border border-ink px-5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted"
          >
            {t("Join")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => navigate("/dreams/leaderboard")}
          className="mt-4 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
        >
          {t("Leaderboard")}
        </button>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The party
// ---------------------------------------------------------------------------

const PartyStrip: React.FC<{ run: DreamView; content: ContentResponse | null }> = ({ run, content }) => (
  <ul className="flex flex-wrap gap-x-6 gap-y-2">
    {run.members.map((m, i) => {
      const kit = kitOf(m.loadout, content);
      return (
        <li key={m.userId + i} className={`flex items-center gap-2 ${m.left ? "opacity-40" : ""}`}>
          <ElementGlyph element={kit?.element} size={14} />
          <span className="font-display text-[15px] font-bold">{m.name}</span>
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            {kit?.grimoire.name}
            {m.leader ? ` · ${t("leader")}` : ""}
            {i === run.you ? ` · ${t("you")}` : ""}
            {m.left ? ` · ${t("left")}` : !m.connected ? ` · ${t("away")}` : ""}
            {m.boons.length > 0 ? ` · ${tn("{n} boon", "{n} boons", m.boons.length)}` : ""}
          </span>
        </li>
      );
    })}
  </ul>
);

const Gathering: React.FC<{ run: DreamView; send: Send; connected: boolean; content: ContentResponse | null }> = ({
  run,
  send,
  connected,
  content,
}) => {
  const leader = run.members[run.you]?.leader;
  return (
    <div className="mt-5 short:mt-3">
      <Label>{t("Party code")}</Label>
      <p className="mt-1 font-mono text-[34px] font-medium tracking-[0.3em] short:text-[26px]">{run.id}</p>
      <p className="text-[13px] text-graphite">Share it: up to three can climb together.</p>
      <div className="mt-5 border-t border-ink pt-3">
        <PartyStrip run={run} content={content} />
      </div>
      {leader ? (
        <button
          type="button"
          disabled={!connected}
          onClick={() => send(withId({ type: "dream_start" as const }))}
          className="mt-6 w-full btn-gold px-4 py-3.5 font-display text-[16px] font-bold disabled:bg-hairline disabled:text-muted sm:w-auto sm:px-10"
        >
          {t("Start the climb")}
        </button>
      ) : (
        <p className="mt-6 font-mono text-[10px] uppercase tracking-label text-muted">
          {t("Waiting for the leader to start")}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// A floor's rooms
// ---------------------------------------------------------------------------

/** Monsters of a room, the same ones counted together. */
const groups = (room: DreamRoom) => {
  const out: { id: string; name: string; count: number; health: number; spells: string[] }[] = [];
  for (const m of room.monsters ?? []) {
    const same = out.find((g) => g.id === m.monster);
    if (same) same.count++;
    else out.push({ id: m.monster, name: m.name, count: 1, health: m.stats.health, spells: m.spells });
  }
  return out;
};

const RoomCard: React.FC<{
  run: DreamView;
  room: DreamRoom;
  content: ContentResponse | null;
  selected: boolean;
  onSelect: () => void;
}> = ({ run, room, content, selected, onSelect }) => {
  const difficulty = content?.dream?.floors.difficulties.find((d) => d.id === room.difficulty);
  const pointers = run.members.filter((m) => !m.left && m.pointed === room.index);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full min-w-[230px] flex-col border-2 bg-panel p-3 text-left transition-colors short:min-w-[210px] short:p-2 ${
        selected ? "border-ink" : "border-hairline hover:border-rule"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[17px] font-bold">{islandName(content, room.island)}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-label text-ink">
          {room.boss ? t("Ruler") : difficulty?.name ?? room.difficulty}
        </span>
      </div>

      {room.boss && (
        <div className="mt-2 flex gap-2">
          <CreaturePortrait id={room.boss.boss} zoom={0.5} className="h-16 w-16 flex-none" />
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold">{room.boss.name}</p>
            <p className="font-mono text-[9.5px] uppercase tracking-label text-muted">{t("{n} HP", { n: room.boss.stats.health })}</p>
            <p className="mt-1 text-[12.5px] italic text-graphite">{room.boss.tactic}</p>
          </div>
        </div>
      )}

      <ul className="mt-2 flex flex-col gap-1">
        {groups(room).map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <CreaturePortrait id={g.id} zoom={0.5} className="h-8 w-8 flex-none" />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">
              {g.count > 1 ? `${g.count} × ` : ""}
              {g.name}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-graphite">{g.health} HP</span>
          </li>
        ))}
      </ul>

      {room.twists.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-hairline pt-2">
          {room.twists.map((id) => {
            const twist = content?.dream?.twists.find((t) => t.id === id);
            return (
              <li key={id} className="text-[12.5px] text-graphite">
                <b className="font-medium text-ink">{twist?.name ?? id}.</b> {twist?.description}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline pt-2">
        <span className="flex flex-wrap gap-2">
          {room.rarities.map((r, i) => (
            <RarityMark key={i} rarity={r} />
          ))}
        </span>
        {pointers.length > 0 && (
          <span className="truncate font-mono text-[9px] uppercase tracking-label text-ink">
            ← {pointers.map((m) => m.name).join(", ")}
          </span>
        )}
      </div>
    </button>
  );
};

const Floor: React.FC<{ run: DreamView; send: Send; connected: boolean; content: ContentResponse | null }> = ({
  run,
  send,
  connected,
  content,
}) => {
  const leader = run.members[run.you]?.leader;
  const rooms = run.offer?.rooms ?? [];
  const mine = run.members[run.you]?.pointed ?? -1;
  const [picked, setPicked] = useState<number>(rooms.length === 1 ? 0 : -1);
  const chosen = leader ? picked : mine;

  return (
    <div className="mt-4 short:mt-2">
      <div className="flex items-center justify-between gap-3">
        <Label>
          {run.offer?.boss ? t("A ruler bars the way") : leader ? t("Choose a room") : t("The leader chooses the room")}
        </Label>
        <PartyCount run={run} />
        {/* On a phone held sideways the rooms fill the screen: the way in sits up here. */}
        {leader && (
          <button
            type="button"
            disabled={!connected || picked < 0}
            onClick={() => send(withId({ type: "dream_enter" as const, room: picked }))}
            className="hidden flex-none btn-gold px-5 py-1.5 font-display text-[14px] font-bold disabled:bg-hairline disabled:text-muted short:block"
          >
            {picked < 0 ? t("Pick a room") : t("Enter")}
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {rooms.map((room) => (
          <RoomCard
            key={room.index}
            run={run}
            room={room}
            content={content}
            selected={chosen === room.index}
            onSelect={() => {
              if (leader) setPicked(room.index);
              else send(withId({ type: "dream_point" as const, room: room.index }));
            }}
          />
        ))}
      </div>
      {leader && (
        <button
          type="button"
          disabled={!connected || picked < 0}
          onClick={() => send(withId({ type: "dream_enter" as const, room: picked }))}
          className="mt-3 w-full btn-gold px-4 py-3 font-display text-[16px] font-bold disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted sm:w-auto sm:px-10 short:hidden"
        >
          {picked < 0 ? t("Pick a room") : t("Enter")}
        </button>
      )}
    </div>
  );
};

const PartyCount: React.FC<{ run: DreamView }> = ({ run }) => (
  <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
    {t("{n} climbing", { n: run.members.filter((m) => !m.left).length })} ·{" "}
    {tn("{n} turn so far", "{n} turns so far", run.turns)}
  </span>
);

// ---------------------------------------------------------------------------
// Boons
// ---------------------------------------------------------------------------

const useSecondsLeft = (deadline: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
};

const Boons: React.FC<{ run: DreamView; send: Send; connected: boolean; content: ContentResponse | null }> = ({
  run,
  send,
  connected,
  content,
}) => {
  const me = run.members[run.you];
  const left = useSecondsLeft(run.boonDeadline);
  return (
    <div className="mt-4 short:mt-2">
      <div className="flex items-baseline justify-between">
        <Label>{t("Floor {n} cleared · take a boon", { n: run.cleared })}</Label>
        <span className="font-mono text-[12px] tabular-nums text-ink">{left}s</span>
      </div>
      {me?.chose ? (
        <p className="mt-4 text-[14px] text-graphite">
          {t("Taken. Waiting for")}{" "}
          {run.members
            .filter((m) => !m.left && !m.chose)
            .map((m) => m.name)
            .join(", ") || t("the next floor")}
          …
        </p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {run.boonOffer.map((id) => {
            const boon = boonOf(content, id);
            return (
              <button
                key={id}
                type="button"
                disabled={!connected}
                onClick={() => send(withId({ type: "dream_boon" as const, boon: id }))}
                className="flex flex-col gap-1 border-2 border-hairline bg-panel p-3 text-left transition-colors hover:border-ink disabled:opacity-50 short:p-2"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[17px] font-bold">
                    <span aria-hidden className="mr-1.5">
                      {boon?.icon}
                    </span>
                    {boon?.name ?? id}
                  </span>
                  {boon && <RarityMark rarity={boon.rarity} />}
                </span>
                <span className="text-[13px] text-graphite">{boon?.description}</span>
              </button>
            );
          })}
        </div>
      )}
      <HeldBoons ids={me?.boons ?? []} content={content} />
    </div>
  );
};

const HeldBoons: React.FC<{ ids: string[]; content: ContentResponse | null }> = ({ ids, content }) =>
  ids.length === 0 ? null : (
    <div className="mt-4 border-t border-hairline pt-2">
      <Label>{t("Your boons")}</Label>
      <p className="mt-1 text-[13px] text-graphite">
        {ids.map((id, i) => {
          const b = boonOf(content, id);
          return (
            <span key={i} title={b?.description} className="mr-3 inline-block">
              <span aria-hidden>{b?.icon}</span> {b?.name ?? id}
            </span>
          );
        })}
      </p>
    </div>
  );

// ---------------------------------------------------------------------------
// The end
// ---------------------------------------------------------------------------

const Over: React.FC<{ run: DreamView; send: Send }> = ({ run, send }) => {
  const navigate = useNavigate();
  return (
    <div className="mt-5 short:mt-3">
      <Label>{t("The dream ends")}</Label>
      <p className="mt-1 font-display text-[34px] font-bold leading-none tracking-tight short:text-[28px]">
        {run.cleared === 0 ? t("Fallen on the first floor") : t("Floor {n} reached", { n: run.cleared })}
      </p>
      <p className="mt-2 text-[14px] text-graphite">
        {tn("{n} turn fought by a party of {size}.", "{n} turns fought by a party of {size}.", run.turns, { size: run.startSize })}
        {run.cleared > 0 ? ` ${t("It is on the leaderboard.")}` : ""}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => send(withId({ type: "dream_leave" as const }))}
          className="btn-gold px-6 py-3 font-display text-[15px] font-bold"
        >
          {t("Dream again")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/dreams/leaderboard")}
          className="border border-ink px-6 py-3 font-display text-[15px] font-bold text-ink transition-colors hover:bg-hairline"
        >
          {t("Leaderboard")}
        </button>
        {run.matchIds.length > 0 && (
          <button
            type="button"
            onClick={() => navigate(`/matches/${run.matchIds[run.matchIds.length - 1]}`)}
            className="border border-ink px-6 py-3 font-display text-[15px] font-bold text-ink transition-colors hover:bg-hairline"
          >
            {t("Replay the last fight")}
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const DreamPage: React.FC = () => {
  const { connected, dream, roomId, sendGameAction, rejection } = useWebSocket();
  const { content } = useContent();
  const navigate = useNavigate();
  const notice = useRejectionBanner(rejection);
  const character = readCharacter();

  useEffect(() => {
    if (!character) navigate("/", { replace: true });
  }, [character, navigate]);
  // The dream opens after the tutorial; a player who has not had it is sent
  // back to the lobby, where it is.
  useEffect(() => {
    if (!hasSeenTutorial() && !dream) navigate("/lobby", { replace: true });
  }, [dream, navigate]);
  // The server takes the party into a floor's fight; the screen follows.
  useEffect(() => {
    if (roomId) navigate("/game");
  }, [roomId, navigate]);

  const send: Send = (action) => sendGameAction(action);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 short:pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            {t("Endless Dreams")}{dream && dream.floor > 0 && dream.phase !== "over" ? ` · ${t("floor {n}", { n: dream.floor })}` : ""}
          </span>
          <span className="flex items-baseline gap-4 font-mono text-[9.5px] uppercase tracking-label text-muted">
            <span className={connected ? "" : "text-vermilion"}>{connected ? "connected" : "reconnecting…"}</span>
            {dream && dream.phase !== "over" ? (
              <button
                type="button"
                onClick={() => send(withId({ type: "dream_leave" as const }))}
                className="uppercase transition-colors hover:text-vermilion"
              >
                {t("Leave the dream")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/lobby")}
                className="uppercase transition-colors hover:text-vermilion"
              >
                {t("Lobby")}
              </button>
            )}
          </span>
        </div>

        {notice && (
          <p role="status" className="mt-3 border-l-2 border-vermilion bg-panel py-2 pl-3 text-[13px] text-vermilion">
            {notice}
          </p>
        )}

        {!dream && (
          <>
            <h1 className="mt-5 font-display text-[clamp(2rem,8vw,2.6rem)] font-bold leading-none tracking-tight short:mt-3 short:text-[26px]">
              {t("Endless Dreams")}
            </h1>
            <Door connected={connected} send={send} content={content} />
          </>
        )}

        {dream && dream.phase !== "gathering" && dream.phase !== "over" && (
          <div className="mt-3 border-b border-hairline pb-2 short:mt-2">
            <PartyStrip run={dream} content={content} />
          </div>
        )}

        {dream?.phase === "gathering" && (
          <Gathering run={dream} send={send} connected={connected} content={content} />
        )}
        {dream?.phase === "room" && <Floor key={dream.floor} run={dream} send={send} connected={connected} content={content} />}
        {dream?.phase === "fighting" && (
          <div className="mt-6">
            <Label>{t("Floor {n}", { n: dream.floor })}</Label>
            <p className="mt-2 text-[15px] text-graphite">Your party is fighting. You will be back here once it is over.</p>
          </div>
        )}
        {dream?.phase === "boons" && <Boons run={dream} send={send} connected={connected} content={content} />}
        {dream?.phase === "over" && <Over run={dream} send={send} />}
      </div>
    </div>
  );
};

export default DreamPage;
