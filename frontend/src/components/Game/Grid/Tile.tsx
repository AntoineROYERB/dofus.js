import React from "react";
import { darkenColor } from "../../../utils/colorUtils";
import { Position } from "../../../types/game";
import { TILE_COLOR } from "../../../constants";

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
  // Generate points for diamond
  const points = `${tileSize.width / 2},0 ${tileSize.width},${
    tileSize.height / 2
  } ${tileSize.width / 2},${tileSize.height} 0,${tileSize.height / 2}`;

  // Base color for the tile

  // Calculate alternating pattern for checkerboard effect
  const tileBaseColor =
    (Math.abs(x) + Math.abs(y)) % 2 === 0
      ? TILE_COLOR
      : darkenColor(TILE_COLOR, 10);

  // Find if this tile is an initial position for any player
  const initialPositionOwner =
    isPositioningPhase && allPlayersInitialPositions
      ? allPlayersInitialPositions.find(
          (item) => item.position.x === x && item.position.y === y
        )
      : undefined;

  const getTileFillColor = (): string => {
    if (isObstacle) return "#57534e";
    if (isPositioningPhase && initialPositionOwner) {
      const isCurrentPlayerInitial = initialPositionOwner.isCurrentPlayer;

      if (isCurrentPlayerInitial) {
        return isHovered ? "rgba(50, 205, 50, 1)" : "rgba(144, 238, 144, 0.6)";
      } else {
        return initialPositionOwner.color;
      }
    }

    if (isCharacterTurn && selectedSpellId) {
      if (isImpactedCell && hoveredPosition && isInSpellRange) {
        return "rgba(255, 165, 0, 0.5)";
      }
      if (isInSpellRange) {
        return "rgba(160, 191, 255, 1)";
      }
    }

    if (!selectedSpellId && isCharacterTurn && isInRange) {
      if (isHovered) return "rgba(255, 0, 0, 0.6)";
      if (isPathCell) return "rgba(255, 165, 0, 0.5)";
      return "rgba(0, 255, 0, 0.2)";
    }

    return tileBaseColor;
  };

  const tileColor = getTileFillColor();

  // Playable cells are reachable with the keyboard: they take focus and answer
  // Enter and Space. The board was mouse-only, which left it unusable without
  // a pointing device.
  const interactive = !!isValidTarget;

  return (
    <div
      className="absolute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Cell ${x}, ${y}` : undefined}
      style={{
        left: `${screenPosition.x - tileSize.width / 2}px`,
        top: `${screenPosition.y - tileSize.height / 2}px`,
        width: `${tileSize.width}px`,
        height: `${tileSize.height}px`,
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "pointer" : "default",
        clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
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
        width={tileSize.width}
        height={tileSize.height}
        viewBox={`0 0 ${tileSize.width} ${tileSize.height}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        {/* Diamond shape */}
        <polygon
          points={points}
          fill={tileColor}
          stroke="#888"
          strokeWidth="0.5"
          style={{ pointerEvents: "none" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="10"
          fill="#000"
          pointerEvents="none"
        >
          ({x}, {y})
        </text>
      </svg>
    </div>
  );
};
