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

  return (
    <div
      className="absolute"
      style={{
        left: `${screenPosition.x - tileSize.width / 2}px`,
        top: `${screenPosition.y - tileSize.height / 2}px`,
        width: `${tileSize.width}px`,
        height: `${tileSize.height}px`,
        pointerEvents: isValidTarget ? "auto" : "none", // Enable pointer events only on valid tiles
        cursor: isValidTarget ? "pointer" : "default",
        clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
      }}
      onClick={isValidTarget ? onClick : undefined}
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
