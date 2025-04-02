import { CSSProperties, useState } from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";
import { Tile } from "./Tile";
interface GridProps {
  gridSize: number;
  selectedPosition: Position;
  onCellClick: ({ x, y }: Position) => void;
  selectedColor?: string;
  latestGameState?: GameStateMessage | null;
  userId: string;
}

const calculatePath = (start: Position, end: Position): Position[] => {
  const path: Position[] = [];
  let current = { ...start };

  while (current.x !== end.x) {
    current = {
      x: current.x + (end.x > current.x ? 1 : -1),
      y: current.y,
    };
    path.push({ ...current });
  }

  while (current.y !== end.y) {
    current = {
      x: current.x,
      y: current.y + (end.y > current.y ? 1 : -1),
    };
    path.push({ ...current });
  }

  return path;
};

const IsWithinRange = (p1: Position, p2: Position, n: number): boolean => {
  if (!p1 || !p2) return false;
  const distance = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  return distance <= n;
};

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

  const players = latestGameState?.players;
  const currentPlayer = players?.[userId];
  const movementPoints = currentPlayer?.character.movementPoints;
  const characterPosition = currentPlayer?.character.position;

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
    const newPosition = { x, y };
    setHoveredPosition(newPosition);

    if (
      characterPosition &&
      movementPoints &&
      IsWithinRange(characterPosition, newPosition, movementPoints)
    ) {
      setPathCells(calculatePath(characterPosition, newPosition));
    } else {
      setPathCells([]);
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
      movementPoints &&
      IsWithinRange(characterPosition, pos, movementPoints);
    const isCharacterTurn = currentPlayer?.isCurrentTurn;
    if (playerOnCell) {
      return { backgroundColor: playerOnCell.character.color };
    }

    if (selectedPosition.x === x && selectedPosition.y === y) {
      return { backgroundColor: selectedColor };
    }

    if (isCharacterTurn && hoveredPosition && isInRange) {
      if (isHoveredCell) {
        return { backgroundColor: "rgba(255, 0, 0, 0.6)" };
      }
      if (isPathCell) {
        return { backgroundColor: "rgba(255, 165, 0, 0.5)" };
      }
      return { backgroundColor: "rgba(0, 255, 0, 0.2)" };
    }

    return {};
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(15, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(20, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: 15 * 20 }).map((_, index) => {
          const x = index % 15;
          const y = Math.floor(index / 15);

          return (
            <Tile
              key={index}
              x={x}
              y={y}
              isSelected={selectedPosition.x === x && selectedPosition.y === y}
              playerOnCell={findPlayerOnCell(x, y)}
              selectedColor={selectedColor}
              onCellClick={onCellClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={getCellStyle(x, y)}
            />
          );
        })}
      </div>
    </div>
  );
};
