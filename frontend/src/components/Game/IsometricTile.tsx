import React, { CSSProperties, useRef, useState } from "react";
import { Position } from "../../types/game";

interface IsometricTileProps {
  x: number;
  y: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  isSelected: boolean;
  playerOnCell: any;
  selectedColor?: string;
  onCellClick: ({ x, y }: Position) => void;
  onMouseEnter: (x: number, y: number) => void;
  onMouseLeave: () => void;
  style?: CSSProperties;
  zIndex?: number;
}

export const IsometricTile: React.FC<IsometricTileProps> = ({
  x,
  y,
  posX,
  posY,
  width,
  height,
  isSelected,
  playerOnCell,
  selectedColor,
  onCellClick,
  onMouseEnter,
  onMouseLeave,
  style,
}) => {
  // Ref to the div element for getting position
  const tileRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  // Generate points for the diamond shape
  const points = `${width / 2},0 ${width},${height / 2} ${
    width / 2
  },${height} 0,${height / 2}`;

  // Base color for the tile
  const baseColor = isSelected ? selectedColor ?? "#f0f0f0" : "#f0f0f0";

  // Calculate alternating pattern for checkerboard effect
  const tileBaseColor =
    (Math.abs(x) + Math.abs(y)) % 2 === 0
      ? baseColor
      : darkenColor(baseColor, 10);

  // Apply hover effect if the tile is hovered
  const tileColor = hovered
    ? lightenColor((style?.backgroundColor as string) || tileBaseColor, 15)
    : style?.backgroundColor || tileBaseColor;

  // Function to darken a color by percentage
  function darkenColor(color: string, percent: number): string {
    if (color.startsWith("rgba")) return color; // Don't modify rgba colors

    // Handle hex colors
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const darkenAmount = 1 - percent / 100;
    const newR = Math.floor(r * darkenAmount);
    const newG = Math.floor(g * darkenAmount);
    const newB = Math.floor(b * darkenAmount);

    return `#${newR.toString(16).padStart(2, "0")}${newG
      .toString(16)
      .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  }

  // Function to lighten a color by percentage
  function lightenColor(color: string, percent: number): string {
    if (color.startsWith("rgba")) return color; // Don't modify rgba colors

    // Handle hex colors
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const lightenAmount = 1 + percent / 100;
    const newR = Math.min(255, Math.floor(r * lightenAmount));
    const newG = Math.min(255, Math.floor(g * lightenAmount));
    const newB = Math.min(255, Math.floor(b * lightenAmount));

    return `#${newR.toString(16).padStart(2, "0")}${newG
      .toString(16)
      .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  }

  // Create a polygon click area over the entire tile
  const handleClick = () => {
    onCellClick({ x, y });
  };

  const handleMouseEnterEvent = () => {
    if (!hovered) {
      setHovered(true);

      onMouseEnter(x, y);
    }
  };

  const handleMouseLeaveEvent = () => {
    setHovered(false);
    onMouseLeave();
  };

  return (
    <div
      ref={tileRef}
      className="absolute"
      style={{
        left: `${posX}px`,
        top: `${posY}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* Use SVG for rendering and for click handling */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ cursor: "pointer" }}
        preserveAspectRatio="none"
      >
        {/* Create a full-size transparent overlay to capture all clicks 
            The overlay needs to be first in the SVG to be behind all other elements */}
        <polygon
          points={points}
          fill={tileColor}
          stroke="#888"
          strokeWidth="0.5"
          onClick={handleClick}
          onMouseEnter={handleMouseEnterEvent}
          onMouseLeave={handleMouseLeaveEvent}
          style={{ pointerEvents: "all" }}
        />

        {/* Player character - should be above other elements but not block clicks */}
        {playerOnCell && (
          <g pointerEvents="none">
            {/* Character base */}
            <ellipse
              cx={width / 2}
              cy={height / 2 + 2}
              rx={width / 5}
              ry={height / 5}
              fill={playerOnCell.character.color}
              stroke="#000"
              strokeWidth="0.5"
            />

            {/* Character symbol/identifier */}
            <text
              x={width / 2}
              y={height / 2 + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontWeight="bold"
              fontSize={height / 2.5}
              style={{ textShadow: "0px 0px 1px #000" }}
            >
              {playerOnCell.character.symbol}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
