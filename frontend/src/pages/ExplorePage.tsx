import React from "react";
import { useNavigate } from "react-router-dom";
import { ExploreBoard } from "../explore/ExploreBoard";
import { readCharacter } from "../utils/characterStorage";

/**
 * The open world: somewhere to walk, with nothing to fight.
 *
 * It is a mode of its own rather than a setting on the fight, because the two
 * boards want opposite things. A fight is read whole — both fighters, every
 * cell in range, all of it on screen at once — and a camera that holds you in
 * the middle takes that away to buy movement a fight has no use for. Out here
 * going somewhere is the entire activity, and the board is allowed to be
 * bigger than the screen because that is what makes it somewhere.
 */
const ExplorePage: React.FC = () => {
  const navigate = useNavigate();
  const character = readCharacter();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper text-ink">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-1.5 sm:px-6">
        <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Dofus.js · open world
          {character?.name ? ` · ${character.name}` : ""}
        </span>
        <div className="flex gap-5">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Click the ground to walk
          </span>
          <button
            type="button"
            onClick={() => navigate("/lobby")}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Back to lobby
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <ExploreBoard color={character?.color} />
      </div>
    </div>
  );
};

export default ExplorePage;
