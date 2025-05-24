import React, { CSSProperties, useState, useEffect, useRef } from "react";
import { Position } from "../../../types/game";
import { GameStateMessage } from "../../../types/message";
import {
  isoToScreen,
  screenToIso,
  generateIsometricCoordinates,
  sortCoordinates,
} from "../utils/isoUtils";
import { calculatePath, isWithinRange } from "../utils/pathUtils";
import { Tile } from "./Tile";

interface GridProps {
  gridSize: number;
  selectedPosition: Position | null;
  onCellClick: ({ x, y }: Position) => void;
  selectedColor?: string;
  latestGameState?: GameStateMessage | null;
  userId: string;
}

export const Grid: React.FC<GridProps> = ({
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
  const [, setMousePosition] = useState({ x: 0, y: 0 });

  // Track whether mouse is inside the grid container
  const [isMouseInContainer, setIsMouseInContainer] = useState(false);

  const players = latestGameState?.players;
  const currentPlayer = players?.[userId];
  const movementPoints = currentPlayer?.character.movementPoints;
  const characterPosition = currentPlayer?.character.position;

  // Get initial positions from the current player's character
  const initialPositions = currentPlayer?.character.initialPositions || [];

  // Check if we're in the positioning phase
  const isPositioningPhase = latestGameState?.status === "position_characters";

  // Collect all players' initial positions for rendering
  const allPlayersInitialPositions = React.useMemo(() => {
    if (!players || !isPositioningPhase) return [];

    const positionsWithOwners: Array<{
      position: Position;
      playerId: string;
      color: string;
      isCurrentPlayer: boolean;
    }> = [];

    Object.entries(players).forEach(([playerId, playerData]) => {
      const isCurrentPlayer = playerId === userId;
      const playerColor = playerData?.character.color;

      playerData?.character.initialPositions?.forEach((position) => {
        positionsWithOwners.push({
          position,
          playerId,
          color: playerColor,
          isCurrentPlayer,
        });
      });
    });

    return positionsWithOwners;
  }, [players, userId, isPositioningPhase]);

  // Calculate tile size to maximize usage of container space
  useEffect(() => {
    const calculateTileSize = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // For a diamond grid, we need to account for both axes
      const radius = Math.floor(gridSize / 2);

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

  // Update path when hovering over cells (only for movement, not for initial positioning)
  useEffect(() => {
    if (
      characterPosition &&
      hoveredPosition &&
      currentPlayer?.isCurrentTurn &&
      !isPositioningPhase
    ) {
      // Check if the hovered position is within movement range
      if (
        movementPoints !== undefined &&
        isWithinRange(characterPosition, hoveredPosition, movementPoints)
      ) {
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

  // Find if a position is one of the initial positions for any player
  const findInitialPositionOwner = (x: number, y: number) => {
    const match = allPlayersInitialPositions.find(
      (item) => item.position.x === x && item.position.y === y
    );
    return match;
  };

  // Check if a position is one of the initial positions for the current player
  const isInitialPosition = (x: number, y: number): boolean => {
    return initialPositions.some((pos) => pos.x === x && pos.y === y);
  };

  const getCellStyle = (x: number, y: number): CSSProperties => {
    const pos = { x, y };
    const playerOnCell = findPlayerOnCell(x, y);
    const isHoveredCell = hoveredPosition?.x === x && hoveredPosition?.y === y;
    const isPathCell = isInPathCells(x, y);
    const isInMovementRange =
      characterPosition &&
      movementPoints !== undefined &&
      isWithinRange(characterPosition, pos, movementPoints);

    const isCharacterTurn = currentPlayer?.isCurrentTurn;

    // Check if this position is an initial position for any player
    const initialPositionOwner = isPositioningPhase
      ? findInitialPositionOwner(x, y)
      : null;

    // If we're in positioning phase and this is an initial position
    if (isPositioningPhase && initialPositionOwner) {
      const isCurrentPlayerInitial = initialPositionOwner.isCurrentPlayer;

      // Current player's initial position styling
      if (isCurrentPlayerInitial) {
        if (isHoveredCell) {
          return {
            backgroundColor: "#32CD32", // Brighter green on hover
            opacity: 0.9,
            boxShadow: "0 0 10px #ffffff",
            border: "2px solid white",
          };
        }

        // Default style for current player's initial positions
        return {
          backgroundColor: "#90ee90", // Light green for current player's initial positions
          opacity: 0.6,
          border: "1px dashed white",
        };
      }
      // Opponent's initial position styling
      else {
        if (isHoveredCell) {
          return {
            backgroundColor: initialPositionOwner.color,
          };
        }

        // Default style for opponent's initial positions
        return {
          backgroundColor: initialPositionOwner.color,
        };
      }
    }

    if (!isPositioningPhase && playerOnCell) {
      return {}; // Don't apply background color to the tile; let Tile handle ellipse fill
    }

    if (
      selectedPosition &&
      selectedPosition.x === x &&
      selectedPosition.y === y
    ) {
      return { backgroundColor: selectedColor };
    }

    if (isCharacterTurn && isInMovementRange && !isPositioningPhase) {
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

  const isInPathCells = (x: number, y: number): boolean => {
    return pathCells.some((pos) => pos.x === x && pos.y === y);
  };

  // Function to determine which tile the mouse is over
  const findTileUnderMouse = (mouseX: number, mouseY: number) => {
    if (!containerRef.current) return null;

    // Get container bounds
    const rect = containerRef.current.getBoundingClientRect();

    // Calculate relative position in container
    const relativeX = mouseX - rect.left;
    const relativeY = mouseY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Convert to isometric coordinates
    const isoPos = screenToIso(
      relativeX,
      relativeY,
      tileSize,
      centerX,
      centerY
    );

    // Check if this position is within our grid
    const coordinates = generateIsometricCoordinates(gridSize);
    const tile = coordinates.find(
      (coord) => coord.x === isoPos.x && coord.y === isoPos.y
    );

    return tile || null;
  };

  // Modified handleClick for tile selection with movement validation
  const handleClick = (e: MouseEvent) => {
    if (!containerRef.current) return;

    const tile = findTileUnderMouse(e.clientX, e.clientY);
    if (tile) {
      // In positioning phase, allow clicking only on valid initial positions
      if (isPositioningPhase) {
        if (isInitialPosition(tile.x, tile.y)) {
          onCellClick(tile);
        }
        return;
      }

      // Normal movement logic during game
      if (characterPosition && currentPlayer?.isCurrentTurn) {
        // Check if tile is within movement range and not occupied
        const isInRange =
          movementPoints !== undefined &&
          isWithinRange(characterPosition, tile, movementPoints);
        const isOccupied = findPlayerOnCell(tile.x, tile.y) !== undefined;

        // Only allow movement to valid tiles
        if (isInRange && !isOccupied) {
          const path = calculatePath(characterPosition, tile);
          const cost = path.length - 1; // exclude starting tile
          onCellClick(tile);
          if (currentPlayer?.character) {
            currentPlayer.character.movementPoints -= cost;
            console.log(
              `Movement points remaining: ${currentPlayer.character.movementPoints}`
            );
          }
        }
      }
    }
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
  }, [
    isMouseInContainer,
    tileSize.width,
    tileSize.height,
    characterPosition,
    movementPoints,
    currentPlayer?.isCurrentTurn,
    isPositioningPhase,
    initialPositions,
  ]);

  // Sort coordinates for rendering order (back to front)
  const sortedCoordinates = sortCoordinates(
    generateIsometricCoordinates(gridSize)
  );

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {sortedCoordinates.map(({ x, y }) => {
        const playerOnCell = findPlayerOnCell(x, y);
        const style = getCellStyle(x, y);
        const isHovered = hoveredPosition?.x === x && hoveredPosition?.y === y;
        const isValidInitial = isPositioningPhase && isInitialPosition(x, y);

        // Determine if this tile is a valid movement target
        const isValidTarget = isPositioningPhase
          ? isValidInitial
          : characterPosition &&
            currentPlayer?.isCurrentTurn &&
            movementPoints !== undefined &&
            isWithinRange(characterPosition, { x, y }, movementPoints) &&
            !playerOnCell;

        // Get center coordinates for container
        const centerX = containerRef.current
          ? containerRef.current.clientWidth / 2
          : 0;
        const centerY = containerRef.current
          ? containerRef.current.clientHeight / 2
          : 0;

        // Calculate screen position
        const screenPosition = isoToScreen(x, y, tileSize, centerX, centerY);

        return (
          <Tile
            key={`${x}-${y}`}
            x={x}
            y={y}
            tileSize={tileSize}
            screenPosition={screenPosition}
            isHovered={isHovered}
            isValidTarget={isValidTarget}
            style={style}
            player={
              playerOnCell ??
              (selectedPosition &&
              selectedPosition.x === x &&
              selectedPosition.y === y &&
              currentPlayer
                ? currentPlayer
                : undefined)
            }
            onClick={() => onCellClick({ x, y })}
          />
        );
      })}
    </div>
  );
};
