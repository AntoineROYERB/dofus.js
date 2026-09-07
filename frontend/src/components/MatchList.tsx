import React, { useCallback, useEffect, useState } from "react";
import { MatchPage, MatchSummary } from "../types/match";

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const MatchRow: React.FC<{ match: MatchSummary; onOpen: (id: string) => void }> = ({
  match,
  onOpen,
}) => {
  const names = match.players.map((p) => p.userName).join(" vs ");
  return (
    <li className="flex items-center gap-4 border-b border-hairline py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[16px] font-bold">
          {names || match.roomName}
        </p>
        <p className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          {formatWhen(match.startedAt)} · {match.turns} turns ·{" "}
          {formatDuration(match.durationMs)}
        </p>
      </div>
      <span className="font-mono text-[11px] uppercase tracking-label text-graphite">
        {match.winner ? `${match.winner} won` : "no winner"}
      </span>
      <button
        type="button"
        onClick={() => onOpen(match.id)}
        className="border border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        Replay
      </button>
    </li>
  );
};

type MatchListProps = {
  /** GET /api/matches or GET /auth/matches, whichever this list is showing. */
  fetchFn: (cursor?: string) => Promise<MatchPage>;
  onOpen: (id: string) => void;
  emptyMessage?: string;
  errorMessage?: string;
};

/**
 * The list/pagination UI shared by MatchHistoryPage (everyone's recent
 * matches) and ProfilePage (one signed-in account's matches) — the same
 * rendering, pointed at a different fetch function.
 */
const MatchList: React.FC<MatchListProps> = ({
  fetchFn,
  onOpen,
  emptyMessage = "No finished matches yet.",
  errorMessage = "Could not load match history.",
}) => {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchFn(cursor);
        const found = page.matches ?? [];
        setMatches((prev) => (cursor ? [...prev, ...found] : found));
        setNextCursor(page.nextCursor);
      } catch {
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, errorMessage],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      {error && (
        <p className="mt-4 border-l-2 border-vermilion bg-panel py-2 pl-3 text-[13px] text-vermilion">
          {error}
        </p>
      )}

      <section className="mt-6 flex-1 border-t border-ink">
        {matches.length === 0 && !loading ? (
          <p className="py-8 text-center text-[13px] text-muted">{emptyMessage}</p>
        ) : (
          <ul>
            {matches.map((match) => (
              <MatchRow key={match.id} match={match} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </section>

      {nextCursor && (
        <button
          type="button"
          onClick={() => load(nextCursor)}
          disabled={loading}
          className="my-4 self-start border border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-hairline disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
};

export default MatchList;
