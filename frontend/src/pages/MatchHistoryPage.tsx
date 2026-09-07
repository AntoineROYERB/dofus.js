import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMatches } from "../lib/api";
import { MatchSummary } from "../types/match";

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

const MatchHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchMatches(cursor);
      setMatches((prev) => (cursor ? [...prev, ...page.matches] : page.matches));
      setNextCursor(page.nextCursor);
    } catch {
      setError("Could not load match history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Dofus.js · match history
          </span>
          <button
            type="button"
            onClick={() => navigate("/lobby")}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Back to lobby
          </button>
        </div>

        <h1 className="mt-6 font-display text-[clamp(2rem,9vw,2.6rem)] font-bold leading-none tracking-tight sm:mt-7">
          Recent matches
        </h1>

        {error && (
          <p className="mt-4 border-l-2 border-vermilion bg-panel py-2 pl-3 text-[13px] text-vermilion">
            {error}
          </p>
        )}

        <section className="mt-6 flex-1 border-t border-ink">
          {matches.length === 0 && !loading ? (
            <p className="py-8 text-center text-[13px] text-muted">
              No finished matches yet.
            </p>
          ) : (
            <ul>
              {matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  onOpen={(id) => navigate(`/matches/${id}`)}
                />
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
      </div>
    </div>
  );
};

export default MatchHistoryPage;
