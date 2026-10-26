import React from "react";
import { Modal } from "../Overlay";
import { t } from "../../i18n/lang";

interface GameOverModalProps {
  winner: string;
  /** A rematch; absent where there is none, as on a dream's floor. */
  onPlayAgain?: () => void;
  onExit: () => void;
  /** What a computer opponent says on its way out, when there was one. */
  farewell?: { name: string; line: string };
  /** Opponents a solo win has just opened up. */
  unlocked?: string[];
  /** A dream's floor: whether the party won it, and which it was. */
  dream?: { won: boolean; floor: number };
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  onPlayAgain,
  onExit,
  farewell,
  unlocked = [],
  dream,
}) => {
  return (
    // No way to dismiss it but its buttons: the fight is over, and the
    // board left under it has nothing more to be tapped for.
    <Modal
      labelledBy="game-over-title"
      dim="hard"
      className="max-w-sm rounded-3xl border-2 border-gold/70 bg-panel p-8 shadow-[0_0_40px_rgb(var(--night)/0.8)] short:p-5"
    >
      <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
        {dream ? t("Floor {n}", { n: dream.floor }) : t("Game over")}
      </div>
      <h2 id="game-over-title" className="mt-2 font-display text-[29px] font-bold leading-none tracking-tight">
        {dream ? (dream.won ? t("Floor cleared") : t("The dream ends")) : t("{name} wins", { name: winner })}
      </h2>
      {dream && (
        <p className="mt-3 text-[13.5px] text-graphite">
          {dream.won
            ? t("Every fallen ally stands again, at full health. Boons are waiting.")
            : t("The party has fallen. Its climb goes on the leaderboard.")}
        </p>
      )}
      {farewell && (
        <blockquote className="mt-5 border-l-2 border-rule pl-3 text-[13.5px] italic text-graphite">
          “{farewell.line}”
          <footer className="mt-1 font-mono text-[9.5px] uppercase not-italic tracking-label text-muted">
            {farewell.name}
          </footer>
        </blockquote>
      )}
      {unlocked.length > 0 && (
        <p className="mt-4 font-mono text-[9.5px] uppercase tracking-label text-ink">
          {t("Unlocked")} · {unlocked.join(", ")}
        </p>
      )}
      <div className="mt-7 flex gap-3 short:mt-4">
        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="flex-1 btn-gold px-3 py-3 font-display text-[15px] font-bold"
          >
            {t("Play again")}
          </button>
        )}
        <button
          onClick={onExit}
          className={
            onPlayAgain
              ? "flex-1 btn-night px-3 py-3 font-display text-[15px] font-bold"
              : "flex-1 btn-gold px-3 py-3 font-display text-[15px] font-bold"
          }
        >
          {dream ? t("Continue") : t("Leave")}
        </button>
      </div>
    </Modal>
  );
};
