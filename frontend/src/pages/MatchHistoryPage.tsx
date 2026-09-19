import React from "react";
import { useNavigate } from "react-router-dom";
import { fetchMatches } from "../lib/api";
import MatchList from "../components/MatchList";

const MatchHistoryPage: React.FC = () => {
  const navigate = useNavigate();

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

        <MatchList fetchFn={fetchMatches} onOpen={(id) => navigate(`/matches/${id}`)} />
      </div>
    </div>
  );
};

export default MatchHistoryPage;
