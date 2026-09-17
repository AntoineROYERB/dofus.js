import React from "react";
import { Position } from "../../../types/game";
import { SPRITE } from "../../../constants";
import { RULES } from "../../../utils/terrain";

interface BurnMarkerProps {
  /** The fighter's animated position, feet on the cell. */
  screenPosition: Position;
  tileSize: { width: number; height: number };
  /** How many burns are stacked on the fighter. */
  stacks: number;
  /** How many of the fighter's turns the burns have left. */
  turnsLeft: number;
}

const EMBER = "#e2521d";
const EMBER_HOT = "#ffb03a";
const MAX_STACKS = 3;

const Flame: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => (
  <svg
    width={size}
    height={size * 1.3}
    viewBox="0 0 20 26"
    className="animate-flicker origin-bottom"
    style={{ animationDelay: `${delay}ms` }}
    aria-hidden
  >
    <path
      d="M10 1c.6 4.4 3.6 6 5.8 8.6A8.6 8.6 0 0 1 18 15a8 8 0 0 1-16 0c0-2.2 1-3.9 2.3-5.3.5 1.4 1.3 2.2 2.3 2.6C5.8 8.3 6.8 4 10 1Z"
      fill={EMBER}
    />
    <path d="M10 25a4.2 4.2 0 0 0 4.2-4.2c0-2-2-3-4.2-5.8-2.2 2.8-4.2 3.8-4.2 5.8A4.2 4.2 0 0 0 10 25Z" fill={EMBER_HOT} />
  </svg>
);

/**
 * What burning looks like on the board. A burn used to be a badge in a panel,
 * which nobody reads mid-fight; this puts it on the fighter: a counter over
 * the head that jumps each time another burn lands, pips for the turns it has
 * left, and one flame at the feet per stack, so three burns look like three.
 */
export const BurnMarker: React.FC<BurnMarkerProps> = ({
  screenPosition,
  tileSize,
  stacks,
  turnsLeft,
}) => {
  const tw = tileSize.width;
  const headY = screenPosition.y - (SPRITE.feet - SPRITE.headTop) * tw;
  const flame = Math.max(12, tw * 0.16);

  return (
    <>
      {/* Over the head, beside where the health bar shows. */}
      <div
        className="pointer-events-none absolute z-20 flex items-center gap-0.5 border-2 bg-paper px-1 py-0.5 shadow-sm"
        style={{
          left: `${screenPosition.x}px`,
          top: `${headY - tileSize.height * 0.55}px`,
          transform: "translate(-50%, -100%)",
          borderColor: EMBER,
        }}
        title={`Burning ×${stacks}: ${stacks * RULES.burnDamagePerStack} damage at the start of each turn, ${turnsLeft} turn${turnsLeft > 1 ? "s" : ""} left`}
      >
        <Flame size={Math.max(10, tw * 0.1)} />
        <span
          key={stacks}
          className="animate-burn-pop font-display text-[13px] font-bold leading-none tabular-nums"
          style={{ color: EMBER }}
        >
          ×{stacks}
        </span>
        <span className="ml-0.5 flex gap-[2px]" aria-hidden>
          {Array.from({ length: MAX_STACKS }, (_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5"
              style={{
                backgroundColor: i < turnsLeft ? EMBER_HOT : "transparent",
                border: `1px solid ${EMBER}`,
              }}
            />
          ))}
        </span>
      </div>

      {/* One flame per stack, licking up round the feet. */}
      {Array.from({ length: stacks }, (_, i) => {
        const angle = Math.PI * (0.15 + (0.7 * (i + 0.5)) / stacks);
        const x = screenPosition.x - Math.cos(angle) * tw * 0.26;
        const y = screenPosition.y + Math.sin(angle) * tileSize.height * 0.12;
        return (
          <div
            key={i}
            className="pointer-events-none absolute z-[6]"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <Flame size={flame} delay={i * 130} />
          </div>
        );
      })}
    </>
  );
};

export default BurnMarker;
