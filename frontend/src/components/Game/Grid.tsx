import { CSSProperties, useState } from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";

interface GridProps {
  gridSize: number;
  selectedPosition: Position;
  onCellClick: ({ x, y }: Position) => void;
  selectedColor?: string;
  latestGameState?: GameStateMessage | null;
  userId: string;
}

interface CellProps {
  x: number;
  y: number;
  isSelected: boolean;
  playerOnCell: any; // Type could be more specific based on your Player type
  selectedColor?: string;
  onCellClick: ({ x, y }: Position) => void;
  onMouseEnter: (x: number, y: number) => void;
  onMouseLeave: () => void;
  style: CSSProperties;
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

const Cell: React.FC<CellProps> = ({
  x,
  y,
  isSelected,
  playerOnCell,
  selectedColor,
  onCellClick,
  onMouseEnter,
  onMouseLeave,
  style,
}) => (
  <div
    onClick={() => onCellClick({ x, y })}
    onMouseEnter={() => onMouseEnter(x, y)}
    onMouseLeave={onMouseLeave}
    className={`
      w-full pt-[100%] relative cursor-pointer 
      transition-colors border border-gray-200 
      ${!playerOnCell && !isSelected ? "bg-gray-100 hover:bg-blue-100" : ""}
    `}
    style={style}
  >
    {playerOnCell && (
      <div className="absolute inset-0 flex items-center justify-center text-white font-bold">
        {playerOnCell.character.symbol}
      </div>
    )}
  </div>
);

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
    <div className="bg-white p-4 rounded-lg shadow">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const x = index % gridSize;
          const y = Math.floor(index / gridSize);
          const playerOnCell = findPlayerOnCell(x, y);
          const isSelected =
            selectedPosition.x === x && selectedPosition.y === y;

          return (
            <Cell
              key={index}
              x={x}
              y={y}
              isSelected={isSelected}
              playerOnCell={playerOnCell}
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
