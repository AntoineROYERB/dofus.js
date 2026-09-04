import React from "react";
import { BOARD, SPRITE } from "../../../constants";
import { Position } from "../../../types/game";
import { Hit, HIT_HOLD, HIT_FADE } from "../../../hooks/useHitFeedback";

interface HitFeedbackProps {
  /** The animated position, so the bar rides a fighter that is still walking. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  hit: Hit;
}

/** How long the figure takes to rise and go, well before the bar does. */
const NUMBER_FLIGHT = 900;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What a spell took off, over the head of whoever it took it off.
 *
 * The board already estimates damage before the click, in vermilion, above the
 * cell being aimed at. This is the other half of that sentence: the same colour
 * in the same place, saying what actually happened. The bar underneath answers
 * the question the estimate cannot — how much of that fighter is left — and it
 * only exists while the question is being asked, which is why nothing is drawn
 * over an untouched character.
 */
export const HitFeedback: React.FC<HitFeedbackProps> = ({
  screenPosition,
  tileSize,
  hit,
}) => {
  const reduced = React.useMemo(prefersReducedMotion, []);

  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const [share, setShare] = React.useState(() =>
    clamp(hit.from / hit.maxHealth)
  );
  const [showNumber, setShowNumber] = React.useState(true);

  /*
   * The bar mounts on the health the fighter had a moment ago and is only then
   * told the new figure, so the CSS width transition has something to travel.
   * On a second hit it is already sitting on the old value — `from` is the
   * health it is showing — so it simply carries on down.
   */
  React.useEffect(() => {
    const target = clamp(hit.health / hit.maxHealth);
    if (reduced) {
      setShare(target);
      return;
    }
    const frame = requestAnimationFrame(() => setShare(target));
    return () => cancelAnimationFrame(frame);
  }, [hit.hitId, hit.health, hit.maxHealth, reduced]);

  React.useEffect(() => {
    setShowNumber(true);
    const timer = window.setTimeout(() => setShowNumber(false), NUMBER_FLIGHT);
    return () => window.clearTimeout(timer);
  }, [hit.hitId]);

  // Hung off the helmet rather than off the frame, which is mostly empty.
  const headTop =
    screenPosition.y - (SPRITE.feet - SPRITE.headTop) * tileSize.width;

  // Wide enough to read a share off, short enough not to become a second
  // character standing on the cell: a 1px rule takes two of these pixels.
  const barWidth = Math.max(34, tileSize.width * 0.66);
  const barHeight = Math.max(5, Math.round(tileSize.width * 0.075));
  const barTop = headTop - barHeight - 6;

  const healed = hit.delta > 0;
  // A heal that is drawn in the damage colour is a bar that lies about itself.
  const accent = healed ? BOARD.place : BOARD.accent;

  return (
    <>
      <div
        className="absolute"
        style={{
          left: `${screenPosition.x - barWidth / 2}px`,
          top: `${barTop}px`,
          width: `${barWidth}px`,
          height: `${barHeight}px`,
          pointerEvents: "none",
          backgroundColor: BOARD.tile,
          border: `1px solid ${BOARD.zoneEdge}`,
          /*
           * It holds, then goes. Under reduced motion nothing fades at all and
           * the bar simply stops existing when the hook drops it, which is the
           * same moment — the guard in index.css would otherwise collapse this
           * animation straight to its invisible last frame.
           */
          animation: reduced
            ? undefined
            : `hit-fade ${HIT_FADE}ms linear ${HIT_HOLD}ms forwards`,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${share * 100}%`,
            backgroundColor: accent,
            transition: reduced ? undefined : "width 380ms ease-out",
          }}
        />
      </div>

      {showNumber && (
        <div
          className="absolute pointer-events-none font-display font-bold tabular-nums"
          style={{
            left: `${screenPosition.x}px`,
            top: `${barTop - 6}px`,
            color: accent,
            fontSize: `${Math.max(14, tileSize.width * 0.24)}px`,
            textShadow:
              "0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff",
            /*
             * Reduced motion keeps the figure still and readable for its whole
             * life rather than dropping it: the guard in index.css collapses
             * every animation to its last frame, and this one's last frame is
             * invisible.
             */
            transform: "translate(-50%, -100%)",
            animation: reduced
              ? undefined
              : `hit-figure ${NUMBER_FLIGHT}ms ease-out forwards`,
          }}
        >
          {healed ? "+" : "−"}
          {Math.abs(hit.delta)}
        </div>
      )}
    </>
  );
};

export default HitFeedback;
