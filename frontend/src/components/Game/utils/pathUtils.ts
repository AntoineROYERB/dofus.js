import { Position } from "../../../types/game";

/**
 * Calculate path using only orthogonal movements (no diagonals)
 */
export const calculatePath = (start: Position, end: Position): Position[] => {
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

/**
 * Check if position is within movement range using Manhattan distance
 */
export const isWithinRange = (
  p1: Position,
  p2: Position,
  movementPoints: number
): boolean => {
  if (!p1 || !p2) return false;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Manhattan-like movement for diamond grid
  const distance = Math.abs(dx) + Math.abs(dy);
  const inGrid = Math.abs(p2.x) + Math.abs(p2.y) <= Math.floor(15 / 2);

  return distance <= movementPoints && inGrid;
};
