import React, { CSSProperties, useState, useEffect, useRef } from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";

interface IsometricGridProps {
  gridSize: { width: number; height: number };
  selectedPosition: Position;
  onCellClick: ({ x, y }: Position) => void;
  selectedColor?: string;
  latestGameState?: GameStateMessage | null;
  userId: string;
}

// Calculate path using only orthogonal movements (no diagonals)
const calculatePath = (start: Position, end: Position): Position[] => {
  const path: Position[] = [];
  const current = { ...start };

  // Add the starting position
  path.push({ ...current });

  // First handle all X movements
  while (current.x !== end.x) {
    if (current.x < end.x) {
      current.x += 1;
    } else {
      current.x -= 1;
    }
    path.push({ ...current });
  }

  // Then handle all Y movements
  while (current.y !== end.y) {
    if (current.y < end.y) {
      current.y += 1;
    } else {
      current.y -= 1;
    }
    path.push({ ...current });
  }

  return path;
};

const IsWithinRange = (p1: Position, p2: Position, PM: number): boolean => {
  if (!p1 || !p2) return false;

  // Modified Manhattan distance for isometric coordinates
  const distance = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
  return distance <= PM;
};

export const IsometricGrid: React.FC<IsometricGridProps> = ({
  gridSize,
  selectedPosition,
  onCellClick,
  selectedColor,
  latestGameState,
  userId,
}) => {
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null);
  const [pathCells, setPathCells] = useState<Position[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState({ width: 40, height: 20 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Track whether mouse is inside the grid container
  const [isMouseInContainer, setIsMouseInContainer] = useState(false);

  const players = latestGameState?.players;
  const currentPlayer = players?.[userId];
  const movementPoints = currentPlayer?.character.movementPoints;
  const characterPosition = currentPlayer?.character.position;

  // Calculate tile size to maximize usage of container space
  useEffect(() => {
    const calculateTileSize = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // For a diamond grid, we need to account for both axes
      const size = Math.max(gridSize.width, gridSize.height);
      const radius = Math.floor(size / 2);

      // Calculate maximum width based on diamond shape
      // The max width of the diamond is 2*radius+1 tiles
      const maxWidth = 2 * radius + 1;

      // Calculate tile width to fit the container width
      // We need to account for the fact that tiles are staggered
      const tileWidth = containerWidth / (maxWidth * 0.75);

      // Make sure tiles aren't too tall for container height
      const maxHeight = 2 * radius + 1;
      const maxTileHeight = containerHeight / (maxHeight * 0.75);
      const maxTileWidth = maxTileHeight * 2;

      // Use the smaller of the two calculations to ensure grid fits
      const finalWidth = Math.min(tileWidth, maxTileWidth);
      const finalHeight = finalWidth * 0.5;

      setTileSize({ width: finalWidth, height: finalHeight });
    };

    calculateTileSize();
    window.addEventListener("resize", calculateTileSize);
    return () => window.removeEventListener("resize", calculateTileSize);
  }, [gridSize, containerRef.current]);

  // Update path when hovering over cells
  useEffect(() => {
    if (characterPosition && hoveredPosition && currentPlayer?.isCurrentTurn) {
      const path = calculatePath(characterPosition, hoveredPosition);

      // Filter path to respect movement points
      // Start from index 1 to exclude the starting position
      const filteredPath = path.slice(
        1,
        movementPoints !== undefined ? movementPoints + 1 : undefined
      );

      setPathCells(filteredPath);
    } else {
      setPathCells([]);
    }
  }, [
    hoveredPosition,
    characterPosition,
    movementPoints,
    currentPlayer?.isCurrentTurn,
  ]);

  const findPlayerOnCell = (x: number, y: number) => {
    return (
      players &&
      Object.values(players).find(
        (player) =>
          player?.character?.position?.x === x &&
          player?.character?.position?.y === y
      )
    );
  };

  const isInPath = (x: number, y: number): boolean => {
    return pathCells.some((pos) => pos.x === x && pos.y === y);
  };

  const getCellStyle = (x: number, y: number): CSSProperties => {
    const pos = { x, y };
    const playerOnCell = findPlayerOnCell(x, y);
    const isHoveredCell = hoveredPosition?.x === x && hoveredPosition?.y === y;
    const isPathCell = isInPath(x, y);
    const isInRange =
      characterPosition &&
      movementPoints !== undefined &&
      IsWithinRange(characterPosition, pos, movementPoints);

    const isCharacterTurn = currentPlayer?.isCurrentTurn;

    if (playerOnCell) {
      return { backgroundColor: playerOnCell.character.color };
    }

    if (selectedPosition.x === x && selectedPosition.y === y) {
      return { backgroundColor: selectedColor };
    }

    if (isCharacterTurn && isInRange) {
      if (isHoveredCell) {
        return { backgroundColor: "rgba(255, 0, 0, 0.6)" }; // Red for hovered cell
      }
      if (isPathCell) {
        return { backgroundColor: "rgba(255, 165, 0, 0.5)" }; // Orange for path
      }
      return { backgroundColor: "rgba(0, 255, 0, 0.2)" }; // Green for cells in range
    }

    return {};
  };

  // Generate isometric coordinates in a diamond pattern
  const generateIsometricCoordinates = () => {
    const coordinates = [];
    const size = Math.max(gridSize.width, gridSize.height);
    const radius = Math.floor(size / 2);

    // Loop through a square area and filter to create a diamond
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        // Limit to a diamond shape by ensuring the Manhattan distance is within radius
        if (Math.abs(x) + Math.abs(y) <= radius) {
          coordinates.push({ x, y });
        }
      }
    }

    return coordinates;
  };

  // Convert isometric coordinates to screen position
  const isoToScreen = (x: number, y: number) => {
    // Calculate screen position using isometric projection
    const screenX = (x - y) * tileSize.width * 0.5;
    const screenY = (x + y) * tileSize.height * 0.5;

    // Center the grid in the container
    const centerX = containerRef.current
      ? containerRef.current.clientWidth / 2
      : 0;
    const centerY = containerRef.current
      ? containerRef.current.clientHeight / 2
      : 0;

    return {
      x: centerX + screenX,
      y: centerY + screenY,
    };
  };

  // Convert screen coordinates to isometric grid coordinates
  const screenToIso = (screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const centerX = containerRef.current.clientWidth / 2;
    const centerY = containerRef.current.clientHeight / 2;

    // Adjust to make coordinates relative to center
    const relX = screenX - centerX;
    const relY = screenY - centerY;

    // Convert from screen to isometric
    // This is the inverse of the isoToScreen transformation
    const isoX =
      (relX / (tileSize.width * 0.5) + relY / (tileSize.height * 0.5)) / 2;
    const isoY =
      (relY / (tileSize.height * 0.5) - relX / (tileSize.width * 0.5)) / 2;

    return { x: Math.round(isoX), y: Math.round(isoY) };
  };

  // Function to determine which tile the mouse is over
  const findTileUnderMouse = (mouseX: number, mouseY: number) => {
    if (!containerRef.current) return null;

    // Get container bounds
    const rect = containerRef.current.getBoundingClientRect();

    // Calculate relative position in container
    const relativeX = mouseX - rect.left;
    const relativeY = mouseY - rect.top;

    // Convert to isometric coordinates
    const isoPos = screenToIso(relativeX, relativeY);

    // Check if this position is within our grid
    const coordinates = generateIsometricCoordinates();
    const tile = coordinates.find(
      (coord) => coord.x === isoPos.x && coord.y === isoPos.y
    );

    return tile || null;
  };

  // Handle mouse movement in the container
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      // Update mouse position
      setMousePosition({ x: e.clientX, y: e.clientY });

      // Find tile under mouse
      const tile = findTileUnderMouse(e.clientX, e.clientY);

      if (tile) {
        setHoveredPosition(tile);
      } else if (isMouseInContainer) {
        // Only clear if mouse is still in container but not over a valid tile
        setHoveredPosition(null);
      }
    };

    // Handle mouse enter/leave on container
    const handleMouseEnter = () => {
      setIsMouseInContainer(true);
    };

    const handleMouseLeave = () => {
      setIsMouseInContainer(false);
      setHoveredPosition(null);
      setPathCells([]);
    };

    // Handle click for tile selection
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const tile = findTileUnderMouse(e.clientX, e.clientY);
      if (tile) {
        onCellClick(tile);
      }
    };

    // Add event listeners
    document.addEventListener("mousemove", handleMouseMove);

    if (containerRef.current) {
      containerRef.current.addEventListener("mouseenter", handleMouseEnter);
      containerRef.current.addEventListener("mouseleave", handleMouseLeave);
      containerRef.current.addEventListener("click", handleClick);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);

      if (containerRef.current) {
        containerRef.current.removeEventListener(
          "mouseenter",
          handleMouseEnter
        );
        containerRef.current.removeEventListener(
          "mouseleave",
          handleMouseLeave
        );
        containerRef.current.removeEventListener("click", handleClick);
      }
    };
  }, [isMouseInContainer, tileSize.width, tileSize.height]);

  // This is our drawing function, no event handlers needed on individual tiles
  const renderTile = (x: number, y: number) => {
    const screen = isoToScreen(x, y);
    const playerOnCell = findPlayerOnCell(x, y);
    const style = getCellStyle(x, y);
    const isHovered = hoveredPosition?.x === x && hoveredPosition?.y === y;

    // Generate points for diamond
    const points = `${tileSize.width / 2},0 ${tileSize.width},${
      tileSize.height / 2
    } ${tileSize.width / 2},${tileSize.height} 0,${tileSize.height / 2}`;

    // Base color for the tile
    const baseColor =
      selectedPosition.x === x && selectedPosition.y === y
        ? selectedColor ?? "#f0f0f0"
        : "#f0f0f0";

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
        key={`${x}-${y}`}
        className="absolute"
        style={{
          left: `${screen.x - tileSize.width / 2}px`,
          top: `${screen.y - tileSize.height / 2}px`,
          width: `${tileSize.width}px`,
          height: `${tileSize.height}px`,
          zIndex,
          pointerEvents: "none", // Important! No pointer events on tiles
        }}
      >
        <svg
          width={tileSize.width}
          height={tileSize.height}
          viewBox={`0 0 ${tileSize.width} ${tileSize.height}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }} // No pointer events on SVG either
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
          {playerOnCell && (
            <g>
              {/* Character base */}
              <ellipse
                cx={tileSize.width / 2}
                cy={tileSize.height / 2 + 2}
                rx={tileSize.width / 5}
                ry={tileSize.height / 5}
                fill={playerOnCell.character.color}
                stroke="#000"
                strokeWidth="0.5"
              />

              {/* Character symbol */}
              <text
                x={tileSize.width / 2}
                y={tileSize.height / 2 + 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontWeight="bold"
                fontSize={tileSize.height / 2.5}
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

  // Sort coordinates for rendering order (back to front)
  const sortedCoordinates = generateIsometricCoordinates().sort((a, b) => {
    // Sort by sum of coordinates (y + x) for isometric ordering
    return a.y + a.x - (b.y + b.x);
  });

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{
        cursor: hoveredPosition ? "pointer" : "default",
      }}
    >
      {sortedCoordinates.map(({ x, y }) => renderTile(x, y))}
    </div>
  );
};
