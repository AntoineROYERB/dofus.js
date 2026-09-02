import React, { useEffect, useState } from "react";

interface TurnClockProps {
  /** Unix time in ms when the turn is passed on; 0 outside play. */
  turnEndsAt: number;
  isMyTurn: boolean;
}

const secondsLeft = (turnEndsAt: number) =>
  Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));

/**
 * A turn now has a deadline, so a player who walks away cannot freeze the
 * board. Showing the countdown is what makes that rule feel intentional rather
 * than like the game skipping your turn for no reason.
 */
export const TurnClock: React.FC<TurnClockProps> = ({
  turnEndsAt,
  isMyTurn,
}) => {
  const [remaining, setRemaining] = useState(() => secondsLeft(turnEndsAt));

  useEffect(() => {
    if (!turnEndsAt) return;
    setRemaining(secondsLeft(turnEndsAt));
    const id = setInterval(() => setRemaining(secondsLeft(turnEndsAt)), 500);
    return () => clearInterval(id);
  }, [turnEndsAt]);

  if (!turnEndsAt) return null;

  const urgent = remaining <= 10;

  return (
    <span
      className={`tabular-nums text-xs font-medium ${
        urgent ? "text-red-600" : "text-stone-500"
      }`}
      aria-label={`${remaining} seconds left in ${
        isMyTurn ? "your turn" : "this turn"
      }`}
    >
      {remaining}s
    </span>
  );
};
