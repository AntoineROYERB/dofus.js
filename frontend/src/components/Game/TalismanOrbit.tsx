import React from "react";
import { hasRelic } from "../../vfx/relics";
import { RelicIcon } from "./RelicIcon";

/** Where the ultimate a talisman carries stands in a fight. */
export type TalismanState = "charging" | "ready" | "spent";

interface TalismanOrbitProps {
  /** The centre of the orbit, in the parent's pixels. */
  x: number;
  y: number;
  /** Half the orbit's width; it lies on the board, so it is a third as tall. */
  radius: number;
  /** The gem's side, in pixels. */
  size: number;
  /** The ultimate's own colour. */
  color: string;
  state?: TalismanState;
  /** The talisman, drawn as its shard. */
  id?: string;
  /** A pixel of the fighters' art, in the parent's pixels: a 64th of a cell. */
  unit?: number;
}

/**
 * The talisman: a shard of whoever it came from circling its fighter, and the
 * gauge of the ultimate it carries. Grey and slow while the ultimate is
 * charging; glowing, stirring and quick once it is ready, so the opponent
 * sees it coming; gone for the rest of the fight once it has been cast.
 */
export const TalismanOrbit: React.FC<TalismanOrbitProps> = ({
  x,
  y,
  radius,
  size,
  color,
  state = "ready",
  id,
  unit,
}) => {
  if (state === "spent") return null;
  const ready = state === "ready";
  // A full turn round the fighter; each layer swings for half of it.
  const turn = ready ? 2.4 : 6;
  const swing = {
    animationDuration: `${turn / 2}s`,
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    animationDirection: "alternate",
  } as const;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={
        {
          left: `${x}px`,
          top: `${y}px`,
          "--orbit-rx": `${radius}px`,
          "--orbit-ry": `${radius / 3}px`,
        } as React.CSSProperties
      }
    >
      <div style={{ ...swing, animationName: "orbit-x" }}>
        <div
          style={{
            ...swing,
            animationName: "orbit-y",
            animationDelay: `${-turn / 4}s`,
          }}
        >
          {hasRelic(id) && unit ? (
            <RelicIcon
              id={id}
              unit={unit}
              charging={!ready}
              className="absolute left-0 top-0 block"
              style={{ transform: "translate(-50%, -50%)" }}
            />
          ) : (
            <span
              className="absolute block border border-ink"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${-size / 2}px`,
                top: `${-size / 2}px`,
                backgroundColor: ready ? color : "#b9b4a8",
                boxShadow: ready
                  ? `0 0 ${size * 0.9}px ${size * 0.25}px ${color}`
                  : undefined,
                transform: "rotate(45deg)",
                animation: ready
                  ? "talisman-pulse 1.2s ease-in-out infinite"
                  : undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TalismanOrbit;
