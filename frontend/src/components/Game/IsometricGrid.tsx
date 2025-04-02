import React, { CSSProperties, useState, useEffect, useRef } from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";
import { IsometricTile } from "./IsometricTile";

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

  const handleMouseEnter = (x: number, y: number) => {
    if (hoveredPosition?.x !== x || hoveredPosition?.y !== y) {
      setHoveredPosition({ x, y });
    }
  };

  const handleMouseLeave = () => {
    setHoveredPosition(null);
    setPathCells([]);
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

  return (
    <div ref={containerRef} className="w-full h-full relative  overflow-hidden">
      {generateIsometricCoordinates().map(({ x, y }) => {
        const screen = isoToScreen(x, y);
        const playerOnCell = findPlayerOnCell(x, y);
        const style = getCellStyle(x, y);

        return (
          <IsometricTile
            key={`${x}-${y}`}
            x={x}
            y={y}
            posX={screen.x}
            posY={screen.y}
            width={tileSize.width}
            height={tileSize.height}
            isSelected={selectedPosition.x === x && selectedPosition.y === y}
            playerOnCell={playerOnCell}
            selectedColor={selectedColor}
            onCellClick={onCellClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={style}
          />
        );
      })}
    </div>
  );
};
