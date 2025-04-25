import React, { CSSProperties } from "react";
import { Position } from "../../../types/game";
import { darkenColor, lightenColor } from "../utils/colorUtils";
import { Character } from "./Character";

interface PlayerCharacter {
  color: string;
  symbol: string;
  position: Position;
}

interface Player {
  character: PlayerCharacter;
  isCurrentTurn?: boolean;
}

interface TileProps {
  x: number;
  y: number;
  tileSize: {
    width: number;
    height: number;
  };
  screenPosition: {
    x: number;
    y: number;
  };
  isHovered: boolean;
  isSelected: boolean;
  isInPath: boolean;
  isValidTarget: boolean;
  selectedColor?: string;
  style?: CSSProperties;
  player?: Player;
  onClick?: () => void;
}

export const Tile: React.FC<TileProps> = ({
  x,
  y,
  tileSize,
  screenPosition,
  isHovered,
  isSelected,
  isInPath,
  isValidTarget,
  selectedColor,
  style,
  player,
  onClick,
}) => {
  // Generate points for diamond
  const points = `${tileSize.width / 2},0 ${tileSize.width},${
    tileSize.height / 2
  } ${tileSize.width / 2},${tileSize.height} 0,${tileSize.height / 2}`;

  // Base color for the tile
  const baseColor = isSelected ? selectedColor ?? "#f0f0f0" : "#f0f0f0";

  // Calculate alternating pattern for checkerboard effect
  const tileBaseColor =
    (Math.abs(x) + Math.abs(y)) % 2 === 0
      ? baseColor
      : darkenColor(baseColor, 10);

  // Apply hover effect and style colors
  const tileColor = isHovered
    ? lightenColor((style?.backgroundColor as string) || tileBaseColor, 15)
    : style?.backgroundColor || tileBaseColor;

  // Calculate z-index based on position (tiles with higher y values should appear on top)
  const zIndex = y * 100 + x + (isHovered ? 1000 : 0);

  return (
    <div
      className="absolute"
      style={{
        left: `${screenPosition.x - tileSize.width / 2}px`,
        top: `${screenPosition.y - tileSize.height / 2}px`,
        width: `${tileSize.width}px`,
        height: `${tileSize.height}px`,
        zIndex,
        pointerEvents: isValidTarget ? "auto" : "none", // Enable pointer events only on valid tiles
        cursor: isValidTarget ? "pointer" : "default",
      }}
      onClick={isValidTarget ? onClick : undefined}
    >
      <svg
        width={tileSize.width}
        height={tileSize.height}
        viewBox={`0 0 ${tileSize.width} ${tileSize.height}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        {/* Diamond shape */}
        <polygon
          points={points}
          fill={tileColor}
          stroke="#888"
          strokeWidth="0.5"
          style={{ pointerEvents: "none" }}
        />

        {/* Player character */}
        {player && (
          <Character
            color={player.character.color}
            symbol={player.character.symbol}
            tileSize={tileSize}
          />
        )}
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
