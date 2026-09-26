import React from "react";
import { Position } from "../../../types/game";

interface BurnMarkerProps {
  /** The fighter's animated position, feet on the cell. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  /** How many burns are stacked on the fighter. */
  stacks: number;
}

/**
 * The grimoire's burn marker: the small flame fire/ignite draws over its
 * target, cut out of the sheet's sixth frame (the same on every frame).
 */
const MARK = {
  sheet: "/animation/fx/fire/ignite.png",
  sheetW: 3072,
  sheetH: 256,
  x: 5 * 256 + 116,
  y: 20,
  w: 28,
  h: 32,
} as const;

/**
 * What burning looks like on the board: one flame at the feet per stack, so
 * three burns look like three. How many turns they have left is in the
 * fighter's effects, not over their head, where a second counter only said
 * the same thing twice.
 */
export const BurnMarker: React.FC<BurnMarkerProps> = ({
  screenPosition,
  tileSize,
  stacks,
}) => {
  const tw = tileSize.width;

  return (
    <>
      {/*
        One flame per stack, round the feet: the grimoire's burn marker, the
        small flame it draws over whatever it has set alight. Only the flame,
        not the burning ground under it — the fighter is burning, not the cell.
      */}
      {Array.from({ length: stacks }, (_, i) => {
        const angle = Math.PI * (0.15 + (0.7 * (i + 0.5)) / stacks);
        const x = screenPosition.x - Math.cos(angle) * tw * 0.26;
        const y = screenPosition.y + Math.sin(angle) * tileSize.height * 0.12;
        const k = Math.max(0.5, (tw * 0.11) / MARK.w);
        return (
          <div
            key={i}
            className="pointer-events-none absolute z-[6]"
            style={{ left: `${x}px`, top: `${y}px`, transform: "translate(-50%, -100%)" }}
          >
            <div
              aria-hidden
              className="animate-flicker origin-bottom"
              style={{
                width: `${MARK.w * k}px`,
                height: `${MARK.h * k}px`,
                backgroundImage: `url(${MARK.sheet})`,
                backgroundSize: `${MARK.sheetW * k}px ${MARK.sheetH * k}px`,
                backgroundPosition: `${-MARK.x * k}px ${-MARK.y * k}px`,
                backgroundRepeat: "no-repeat",
                imageRendering: "pixelated",
                animationDelay: `${i * 130}ms`,
              }}
            />
          </div>
        );
      })}
    </>
  );
};

export default BurnMarker;
