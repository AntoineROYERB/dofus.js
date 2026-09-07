import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchMatch, fetchMatchRecording, fetchMatchSnapshots } from "../lib/api";
import { MatchSnapshots, MatchSummary } from "../types/match";
import { GameBoard } from "../components/Game/GameBoard";
import SpellBar from "../components/Game/Spellbar";
import { FighterPanel } from "../components/Game/FighterPanel";
import { TurnTimeline } from "../components/Game/TurnTimeline";
import { CombatLog } from "../components/Game/CombatLog";

const MIN_STEP_MS = 350;
const MAX_STEP_MS = 2200;

/** How long to hold on this frame before advancing to the next one, paced
 * off how far apart the two commands actually were — a spell cast a second
 * after the last one plays back a second later, a turn that sat idle for
 * ten does not make the viewer wait ten seconds for it. */
const stepDelay = (fromAtMs: number, toAtMs: number): number =>
  Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, toAtMs - fromAtMs));

const ReplayPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [snapshots, setSnapshots] = useState<MatchSnapshots>([]);
  const [atMs, setAtMs] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchMatch(id), fetchMatchSnapshots(id), fetchMatchRecording(id)])
      .then(([matchSummary, matchSnapshots, recording]) => {
        if (cancelled) return;
        setSummary(matchSummary);
        setSnapshots(matchSnapshots);
        // One command per snapshot, in the same order (see ReplaySnapshots on
        // the backend), so their timestamps line up index-for-index.
        setAtMs(recording.commands.map((c) => c.at));
        setIndex(0);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this match.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!playing || snapshots.length === 0 || index >= snapshots.length - 1) {
      if (index >= snapshots.length - 1) setPlaying(false);
      return;
    }
    const delay = stepDelay(atMs[index] ?? 0, atMs[index + 1] ?? 0);
    const timer = window.setTimeout(() => setIndex((i) => i + 1), delay);
    return () => window.clearTimeout(timer);
  }, [playing, index, snapshots.length, atMs]);

  const state = snapshots[index] ?? null;
  const players = state ? Object.values(state.players) : [];
  // Neither side is "you" in a replay; the timeline just needs a name it
  // will never match, so nobody's stop is drawn as the viewer's own.
  const viewerId = "";

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper text-ink">
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">
          Loading match…
        </p>
      </div>
    );
  }

  if (error || !summary || snapshots.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-paper text-ink">
        <p className="font-mono text-[11px] uppercase tracking-label text-vermilion">
          {error ?? "This match has no recording."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/matches")}
          className="border border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          Back to match history
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper text-ink">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col pl-[env(safe-area-inset-left)]">
          <div className="flex-none px-3 pt-3 sm:px-6 sm:pt-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate("/matches")}
                className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
              >
                ← Match history
              </button>
              <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
                {summary.roomName} · {summary.winner ? `${summary.winner} won` : "no winner"}
              </span>
            </div>
            <TurnTimeline latestGameState={state} userId={viewerId} />
          </div>
          <div className="relative min-h-0 flex-1">
            <GameBoard
              gridSize={15}
              handleSelectedPosition={() => {}}
              selectedPosition={null}
              selectedSpellId={null}
              handleCellClick={() => {}}
              latestGameState={state}
              userId={viewerId}
            />
          </div>
        </div>

        <aside className="hidden w-[300px] flex-none flex-col pl-5 pr-[calc(1.25rem+env(safe-area-inset-right))] pt-4 lg:flex">
          <div className="flex flex-none items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
            <span className="truncate font-display text-[15px] font-bold">
              {summary.roomName}
            </span>
          </div>
          <div className="mb-1.5 mt-4 flex-none font-mono text-[9.5px] uppercase tracking-label text-muted">
            Log
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CombatLog entries={state?.log ?? []} spellBook={state?.spells} />
          </div>
        </aside>
      </div>

      <div className="flex h-[168px] flex-none flex-col gap-3 overflow-hidden border-t-2 border-ink bg-panel px-4 py-3 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] short:h-[140px]">
        <div className="flex flex-1 gap-3 overflow-hidden">
          <div className="w-[142px] flex-none sm:w-[230px] lg:w-[336px]">
            <FighterPanel currentPlayer={players[0]} connected={true} />
          </div>
          <div className="min-w-0 flex-1 border-l border-ink pl-3">
            <SpellBar
              handleSpellClick={() => {}}
              selectedSpellId={null}
              currentPlayer={players.find((p) => p.isCurrentTurn) ?? players[0]}
              spells={state?.spells ?? null}
            />
          </div>
        </div>

        <div className="flex flex-none items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex(0)}
            className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => {
              if (index >= snapshots.length - 1) setIndex(0);
              setPlaying((p) => !p);
            }}
            className="w-20 flex-none border border-ink bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-paper transition-colors hover:bg-vermilion"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() =>
              setIndex((i) => Math.min(snapshots.length - 1, i + 1))
            }
            className="border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            ▶
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, snapshots.length - 1)}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            className="mx-2 min-w-0 flex-1"
          />
          <span className="flex-none font-mono text-[10px] tabular-nums text-muted">
            {index + 1}/{snapshots.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReplayPage;
