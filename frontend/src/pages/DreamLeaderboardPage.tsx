import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLeaderboard } from "../lib/api";
import { LeaderboardEntry } from "../types/message";
import { useContent } from "../hooks/useContent";
import { t } from "../i18n/lang";
import { useMusic } from "../audio/useSound";

const BOARDS = [
  { size: 1, name: "Solo" },
  { size: 2, name: "Duo" },
  { size: 3, name: "Trio" },
];

/**
 * The highest floors reached in Endless Dreams, one board per party size.
 * Every line was written by the server from fights it refereed, and each
 * links to the last of them, replayable.
 */
const DreamLeaderboardPage: React.FC = () => {
  useMusic("night");
  const navigate = useNavigate();
  const { content } = useContent();
  const [size, setSize] = useState(1);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setEntries(null);
    setFailed(false);
    fetchLeaderboard(size)
      .then((board) => live && setEntries(board.entries))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [size]);

  const grimoire = (id: string) => content?.grimoires.find((g) => g.id === id)?.name ?? id;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">Endless Dreams · leaderboard</span>
          <button
            type="button"
            onClick={() => navigate("/dream")}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            {t("Back")}
          </button>
        </div>
        <h1 className="mt-5 font-display text-[clamp(2rem,8vw,2.6rem)] font-bold leading-none tracking-tight short:mt-3 short:text-[26px]">
          {t("Deepest dreams")}
        </h1>

        <div className="mt-4 flex gap-1.5" role="tablist" aria-label={t("Party size")}>
          {BOARDS.map((b) => (
            <button
              key={b.size}
              type="button"
              role="tab"
              aria-selected={size === b.size}
              onClick={() => setSize(b.size)}
              className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition-colors ${
                size === b.size ? "border-ink bg-ink text-paper" : "border-hairline text-graphite hover:border-ink"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <section className="mt-3 border-t border-ink">
          {failed && <p className="py-8 text-center text-[13px] text-vermilion">{t("The leaderboard could not be read.")}</p>}
          {!failed && entries === null && <p className="py-8 text-center text-[13px] text-muted">{t("Loading…")}</p>}
          {entries?.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted">{t("Nobody has climbed this way yet.")}</p>
          )}
          <ol>
            {entries?.map((e, i) => (
              <li key={e.runId} className="flex items-center gap-4 border-b border-hairline py-2.5">
                <span className="w-6 flex-none font-mono text-[12px] tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-bold">{e.names.join(", ")}</p>
                  <p className="truncate font-mono text-[9.5px] uppercase tracking-label text-muted">
                    {e.grimoires.map(grimoire).join(" · ")} · {t("{n} turns", { n: e.turns })}
                  </p>
                </div>
                <span className="font-display text-[20px] font-bold tabular-nums">
                  <span className="mr-1 font-mono text-[9.5px] font-normal uppercase tracking-label text-muted">floor</span>
                  {e.floor}
                </span>
                {e.matchIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(`/matches/${e.matchIds[e.matchIds.length - 1]}`)}
                    className="rounded-full border border-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    {t("Replay")}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
};

export default DreamLeaderboardPage;
