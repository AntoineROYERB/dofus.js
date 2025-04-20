import React, { CSSProperties, useRef, useState, useEffect } from "react";
import { Position } from "../../types/game";

interface TileProps {
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

export const Tile: React.FC<TileProps> = ({
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pointerCaptured, setPointerCaptured] = useState(false);

  // Increase the hit area slightly (10% larger)
  const hitAreaExpansion = 1.1;
  const hitWidth = width * hitAreaExpansion;
  const hitHeight = height * hitAreaExpansion;

  // Generate points for the hit area (slightly larger)
  const hitPoints = `${hitWidth / 2},0 ${hitWidth},${hitHeight / 2} ${
    hitWidth / 2
  },${hitHeight} 0,${hitHeight / 2}`;

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

  // Use effect to attach global pointer move listener when needed
  useEffect(() => {
    // Check if the pointer is over our element
    const checkPointerPosition = (e: PointerEvent) => {
      if (!svgRef.current || !tileRef.current) return;

      const rect = tileRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate distance from center in screen coordinates
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;

      // Convert to diamond coordinates (rotate 45 degrees)
      // In diamond coordinates, the edges are along the x and y axes
      const diamondX = dx * 0.7071 + dy * 0.7071; // cos(45°) = sin(45°) = 0.7071
      const diamondY = -dx * 0.7071 + dy * 0.7071;

      // Check if point is within diamond bounds
      const halfWidth = (rect.width * hitAreaExpansion) / 2;
      const halfHeight = (rect.height * hitAreaExpansion) / 2;

      const isInDiamond =
        Math.abs(diamondX) / halfWidth + Math.abs(diamondY) / halfHeight <= 1;

      // Update hover state if needed
      if (isInDiamond && !hovered) {
        setHovered(true);
        onMouseEnter(x, y);
      } else if (!isInDiamond && hovered && !pointerCaptured) {
        setHovered(false);
        onMouseLeave();
      }
    };

    // Add global listeners when this tile is hovered
    if (hovered) {
      window.addEventListener("pointermove", checkPointerPosition);
    }

    return () => {
      window.removeEventListener("pointermove", checkPointerPosition);
    };
  }, [hovered, x, y, pointerCaptured, hitHeight, hitWidth]);

  // Handler for pointer down event - start of interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    const element = e.currentTarget;
    if (element) {
      element.setPointerCapture(e.pointerId);
      setPointerCaptured(true);

      if (!hovered) {
        setHovered(true);
        onMouseEnter(x, y);
      }

      // Prevent event from propagating to elements below
      e.stopPropagation();
    }
  };

  // Handler for pointer up event - end of interaction
  const handlePointerUp = (e: React.PointerEvent) => {
    const element = e.currentTarget;
    if (element && pointerCaptured) {
      element.releasePointerCapture(e.pointerId);
      setPointerCaptured(false);
    }
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    // Stop propagation to prevent lower tiles from receiving the event
    e.stopPropagation();

    if (!hovered) {
      setHovered(true);
      onMouseEnter(x, y);
    }
  };

  const handlePointerLeave = () => {
    // Only process leave events if we're not capturing
    if (!pointerCaptured) {
      setHovered(false);
      onMouseLeave();
    }
  };

  // Calculate z-index based on position - this helps with visual layering
  // For isometric view, higher x+y values should be in front
  const calculatedZIndex = y * 100 + x;

  return (
    <div
      ref={tileRef}
      className="absolute"
      style={{
        left: `${posX - hitWidth / 2}px`, // Center the expanded hit area
        top: `${posY - hitHeight / 2}px`, // Center the expanded hit area
        width: `${hitWidth}px`,
        height: `${hitHeight}px`,
        zIndex: hovered ? 1000 : calculatedZIndex, // Boost z-index when hovered
      }}
    >
      {/* Use SVG for rendering and for click handling */}
      <svg
        ref={svgRef}
        width={hitWidth}
        height={hitHeight}
        viewBox={`0 0 ${hitWidth} ${hitHeight}`}
        style={{
          cursor: "pointer",
          pointerEvents: "all", // Ensure SVG gets pointer events
        }}
        preserveAspectRatio="none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        {/* Invisible larger hit area */}
        <polygon
          points={hitPoints}
          fill="transparent"
          style={{
            touchAction: "none",
            pointerEvents: "all",
          }}
        />

        {/* Visible tile */}
        <polygon
          points={`${hitWidth / 2 - width / 2 + width / 2},${
            hitHeight / 2 - height / 2
          } 
                  ${hitWidth / 2 - width / 2 + width},${
            hitHeight / 2 - height / 2 + height / 2
          } 
                  ${hitWidth / 2 - width / 2 + width / 2},${
            hitHeight / 2 - height / 2 + height
          } 
                  ${hitWidth / 2 - width / 2},${
            hitHeight / 2 - height / 2 + height / 2
          }`}
          fill={tileColor}
          stroke="#888"
          strokeWidth="0.5"
          style={{ pointerEvents: "none" }} // Let the parent handle events
        />

        {/* Player character */}
        {playerOnCell && (
          <g pointerEvents="none">
            {/* Character base */}
            <ellipse
              cx={hitWidth / 2}
              cy={hitHeight / 2 + 2}
              rx={width / 5}
              ry={height / 5}
              fill={playerOnCell.character.color}
              stroke="#000"
              strokeWidth="0.5"
            />

            {/* Character symbol/identifier */}
            <text
              x={hitWidth / 2}
              y={hitHeight / 2 + 2}
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
