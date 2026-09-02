import React from "react";

interface GameOverModalProps {
  winner: string;
  onPlayAgain: () => void;
  onExit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  onPlayAgain,
  onExit,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-6">
      <div className="w-full max-w-sm border-2 border-ink bg-panel p-8">
        <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Game over
        </div>
        <h2 className="mt-2 font-display text-[29px] font-bold leading-none tracking-tight">
          {winner} wins
        </h2>
        <div className="mt-7 flex gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 bg-vermilion px-3 py-3 font-display text-[15px] font-bold text-white transition-colors hover:bg-[#b93a25]"
          >
            Play again
          </button>
          <button
            onClick={onExit}
            className="flex-1 border border-ink px-3 py-3 font-display text-[15px] font-bold text-ink transition-colors hover:bg-hairline"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};
