import React from "react";
import { SPRITE } from "../../../constants";
import { Position } from "../../../types/game";
import { StatHit } from "../../../hooks/useHitFeedback";

interface StatFeedbackProps {
  /** The animated position, so the number rides a fighter that is still walking. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  hit: StatHit;
  /** The colour this stat is always drawn in, gain or loss alike. */
  color: string;
  /** "PA" or "PM", so the number reads even without the colour. */
  label: string;
  /**
   * How many of these are already stacked above this fighter's head — 0 sits
   * just above the health number's row, 1 a row above that, and so on, so a
   * spell that costs PA and PM at once does not print one over the other.
   */
  slot: number;
}

/** Same flight as HitFeedback's number: rise, fade, gone. */
const NUMBER_FLIGHT = 1800;
const ROW_HEIGHT = 20;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What a spell took off a stat that has no pool to drain — action points,
 * movement points. Coloured by which stat it is rather than by gain or loss,
 * so a +3 PA and a -3 PA read as the same kind of thing happening to the same
 * number: the sign alone says which way it went.
 */
export const StatFeedback: React.FC<StatFeedbackProps> = ({
  screenPosition,
  tileSize,
  hit,
  color,
  label,
  slot,
}) => {
  const reduced = React.useMemo(prefersReducedMotion, []);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), NUMBER_FLIGHT);
    return () => window.clearTimeout(timer);
  }, [hit.hitId]);

  if (!visible) return null;

  const headTop =
    screenPosition.y - (SPRITE.feet - SPRITE.headTop) * tileSize.width;
  const top = headTop - 6 - slot * ROW_HEIGHT;

  return (
    <div
      className="absolute pointer-events-none font-display font-bold tabular-nums"
      style={{
        left: `${screenPosition.x}px`,
        top: `${top}px`,
        color,
        fontSize: `${Math.max(12, tileSize.width * 0.18)}px`,
        textShadow: "0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff",
        transform: "translate(-50%, -100%)",
        animation: reduced
          ? undefined
          : `hit-figure ${NUMBER_FLIGHT}ms ease-out forwards`,
      }}
    >
      {hit.delta > 0 ? "+" : "−"}
      {Math.abs(hit.delta)} {label}
    </div>
  );
};

export default StatFeedback;
