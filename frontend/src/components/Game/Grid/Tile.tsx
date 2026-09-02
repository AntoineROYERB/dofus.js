import React from "react";
import { Position } from "../../../types/game";
import { BOARD } from "../../../constants";

interface TileProps {
  x: number;
  y: number;
  tileSize: {
    width: number;
    height: number;
  };
  screenPosition: Position;
  isHovered: boolean;
  isValidTarget?: boolean;
  onClick?: () => void;
  isPositioningPhase: boolean;
  allPlayersInitialPositions: Array<{
    position: Position;
    playerId: string;
    color: string;
    isCurrentPlayer: boolean;
  }>;
  isCharacterTurn: boolean;
  selectedSpellId: number | null;
  isImpactedCell: boolean;
  isInSpellRange: boolean;
  isInRange: boolean;
  isPathCell: boolean;
  hoveredPosition: Position | null;
  /** Cover: nobody stands here and nothing is seen through it. */
  isObstacle: boolean;
}

/**
 * What is laid over a cell's paper: a wash, never a solid colour, so the
 * board's own checker still shows through everything the game marks.
 */
type Wash = { fill: string; opacity: number; stroke: string; strokeWidth: number };

export const Tile: React.FC<TileProps> = ({
  x,
  y,
  tileSize,
  screenPosition,
  isHovered,
  isValidTarget,
  onClick,
  isPositioningPhase,
  allPlayersInitialPositions,
  isCharacterTurn,
  selectedSpellId,
  isImpactedCell,
  isInSpellRange,
  isInRange,
  isPathCell,
  hoveredPosition,
  isObstacle,
}) => {
  const { width: w, height: h } = tileSize;
  const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;

  // Alternating paper, so the grid reads without needing a heavy outline.
  const base = (Math.abs(x) + Math.abs(y)) % 2 === 0 ? BOARD.tile : BOARD.tileAlt;

  const initialPositionOwner =
    isPositioningPhase && allPlayersInitialPositions
      ? allPlayersInitialPositions.find(
          (item) => item.position.x === x && item.position.y === y
        )
      : undefined;

  const wash = (): Wash | null => {
    const graphite = (opacity: number): Wash => ({
      fill: BOARD.wash,
      opacity,
      stroke: BOARD.stroke,
      strokeWidth: 1,
    });
    const marked: Wash = {
      fill: BOARD.accent,
      opacity: 0.22,
      stroke: BOARD.accent,
      strokeWidth: 1.5,
    };

    if (isPositioningPhase && initialPositionOwner) {
      if (initialPositionOwner.isCurrentPlayer) {
        return { ...marked, opacity: isHovered ? 0.34 : 0.16 };
      }
      // An opponent's starting cells keep their own colour, but only as a
      // tint: on this board the one thing allowed to be saturated is the mark
      // on what you are about to do.
      return {
        fill: initialPositionOwner.color,
        opacity: 0.14,
        stroke: BOARD.stroke,
        strokeWidth: 1,
      };
    }

    if (isCharacterTurn && selectedSpellId) {
      if (isImpactedCell && hoveredPosition && isInSpellRange) return marked;
      if (isInSpellRange) return graphite(0.1);
    }

    if (!selectedSpellId && isCharacterTurn && isInRange) {
      if (isHovered) return marked;
      if (isPathCell) return graphite(0.18);
      return graphite(0.1);
    }

    return null;
  };

  const overlay = wash();

  // Playable cells are reachable with the keyboard: they take focus and answer
  // Enter and Space. The board was mouse-only, which left it unusable without
  // a pointing device.
  const interactive = !!isValidTarget;

  // Cover stands above the ground rather than lying flat on it, so a wall
  // reads as something to walk around and not as a differently coloured floor.
  const rise = isObstacle ? h * BOARD.block.rise : 0;

  return (
    <div
      className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Cell ${x}, ${y}` : undefined}
      style={{
        left: `${screenPosition.x - w / 2}px`,
        top: `${screenPosition.y - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "pointer" : "default",
        // Clipping to the diamond keeps clicks off the corners of the box, but
        // it would also cut off the raised faces of cover.
        clipPath: isObstacle ? undefined : "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
      }}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        {isObstacle ? (
          <g>
            <polygon
              points={`0,${h / 2} ${w / 2},${h} ${w / 2},${h - rise} 0,${h / 2 - rise}`}
              fill={BOARD.block.left}
            />
            <polygon
              points={`${w},${h / 2} ${w / 2},${h} ${w / 2},${h - rise} ${w},${h / 2 - rise}`}
              fill={BOARD.block.right}
            />
            <polygon
              points={points}
              transform={`translate(0, ${-rise})`}
              fill={BOARD.block.top}
              stroke={BOARD.block.stroke}
              strokeWidth={1}
            />
          </g>
        ) : (
          <>
            <polygon points={points} fill={base} stroke="none" />
            {overlay && (
              <polygon
                points={points}
                fill={overlay.fill}
                fillOpacity={overlay.opacity}
                stroke="none"
              />
            )}
            {/* The outline goes on last, so a marked cell keeps a crisp edge. */}
            <polygon
              points={points}
              fill="none"
              stroke={overlay ? overlay.stroke : BOARD.stroke}
              strokeWidth={overlay ? overlay.strokeWidth : 1}
            />
          </>
        )}
      </svg>
    </div>
  );
};
