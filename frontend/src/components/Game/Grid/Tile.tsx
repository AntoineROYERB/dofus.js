import React, { CSSProperties } from "react";
import { darkenColor, lightenColor } from "../utils/colorUtils";
import { Player } from "../../../types/game";
import { TILE_COLOR } from "../../../constants";
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
  isValidTarget?: boolean;
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
  isValidTarget,
  style,
  player,
  onClick,
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

  // Apply hover effect and style colors
  const tileColor = isHovered
    ? lightenColor((style?.backgroundColor as string) || tileBaseColor, 15)
    : style?.backgroundColor || tileBaseColor;
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
        {player && (
          <ellipse
            cx={tileSize.width / 2}
            cy={tileSize.height / 2}
            rx={tileSize.width * 0.15}
            ry={tileSize.height * 0.2}
            fill={player.character.color}
            stroke="#000"
          />
        )}
      </svg>
    </div>
  );
};
