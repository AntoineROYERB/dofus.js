import { Position } from "../../../types/game";

/**
 * Convert isometric coordinates to screen position
 */
export const isoToScreen = (
  x: number,
  y: number,
  tileSize: { width: number; height: number },
  centerX: number,
  centerY: number
): Position => {
  // Calculate screen position using isometric projection
  const screenX = (x - y) * tileSize.width * 0.5;
  const screenY = (x + y) * tileSize.height * 0.5;

  // Center the grid in the container
  return {
    x: centerX + screenX,
    y: centerY + screenY,
  };
};

/**
 * Convert screen coordinates to isometric grid coordinates
 */
export const screenToIso = (
  screenX: number,
  screenY: number,
  tileSize: { width: number; height: number },
  centerX: number,
  centerY: number
): Position => {
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

/**
 * Generate isometric coordinates in a diamond pattern
 */
export const generateIsometricCoordinates = (gridSize: number): Position[] => {
  const coordinates: Position[] = [];
  const radius = Math.floor(gridSize / 2);

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

/**
 * Sort coordinates for proper rendering order (back to front)
 */
export const sortCoordinates = (coordinates: Position[]): Position[] => {
  return [...coordinates].sort((a, b) => {
    // Deterministic sort: by sum, then x, then y
    return a.y + a.x - (b.y + b.x) || a.x - b.x || a.y - b.y;
  });
};
