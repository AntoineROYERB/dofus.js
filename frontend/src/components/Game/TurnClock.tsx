import React, { useEffect, useRef, useState } from "react";

interface TurnClockProps {
  /** Unix time in ms when the turn is passed on; 0 outside play. */
  turnEndsAt: number;
  isMyTurn: boolean;
  /**
   * "inline" is the small figure that sits next to a name in the timeline;
   * "display" is the large one in the turn zone of the bar, with its track.
   */
  variant?: "inline" | "display";
}

const secondsLeft = (turnEndsAt: number) =>
  Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));

/**
 * A turn has a deadline, so a player who walks away cannot freeze the board.
 * Showing the countdown is what makes that rule feel intentional rather than
 * like the game skipping your turn for no reason.
 *
 * The server never sends the turn's length, only its deadline, so the track
 * measures against the longest time this turn has been seen to have left.
 */
export const TurnClock: React.FC<TurnClockProps> = ({
  turnEndsAt,
  isMyTurn,
  variant = "inline",
}) => {
  const [remaining, setRemaining] = useState(() => secondsLeft(turnEndsAt));
  const total = useRef(secondsLeft(turnEndsAt) || 1);

  useEffect(() => {
    if (!turnEndsAt) return;
    const start = secondsLeft(turnEndsAt);
    total.current = Math.max(start, 1);
    setRemaining(start);
    const id = setInterval(() => setRemaining(secondsLeft(turnEndsAt)), 500);
    return () => clearInterval(id);
  }, [turnEndsAt]);

  if (!turnEndsAt) return null;

  const label = `${remaining} seconds left in ${
    isMyTurn ? "your turn" : "this turn"
  }`;
  const urgent = remaining <= 10;

  if (variant === "inline") {
    return (
      <span
        className={`font-mono text-[9.5px] tabular-nums ${
          urgent ? "text-vermilion" : "text-muted"
        }`}
        aria-label={label}
      >
        {remaining} s
      </span>
    );
  }

  const share = Math.min(1, Math.max(0, remaining / total.current));

  return (
    <div aria-label={label}>
      <div
        className={`font-display text-[42px] font-bold leading-none tabular-nums ${
          urgent ? "text-vermilion" : "text-ink"
        }`}
      >
        {remaining}
        <span className="ml-1 text-[17px] text-muted">s</span>
      </div>
      <div className="mt-2 h-1 bg-hairline">
        <div
          className={`h-full transition-[width] duration-500 ease-linear ${
            urgent ? "bg-vermilion" : "bg-ink"
          }`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
};
