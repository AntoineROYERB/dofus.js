import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";

// src/components/Game/Grid.tsx
interface GridProps {
  gridSize: number;
  selectedPosition: Position;
  onCellClick: (index: number) => void;
  selectedColor?: string;
  latestGameState?: GameStateMessage | null;
}

export const Grid: React.FC<GridProps> = ({
  gridSize,
  selectedPosition,
  onCellClick,
  selectedColor,
  latestGameState,
}) => {
  //Helper function to find player on a cell
  const players = latestGameState?.players;

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

          const isSelectedPosition =
            selectedPosition.x === x && selectedPosition.y === y;

          // Check if any player is on this cell
          const playerOnCell = findPlayerOnCell(x, y);

          return (
            <div
              key={index}
              onClick={() => onCellClick(index)}
              className={`
                  w-full pt-[100%] relative cursor-pointer 
                  transition-colors border border-gray-200 
                  ${
                    !playerOnCell && !isSelectedPosition
                      ? "bg-gray-100 hover:bg-blue-100"
                      : ""
                  }
                `}
              style={
                isSelectedPosition
                  ? { backgroundColor: selectedColor }
                  : playerOnCell
                  ? { backgroundColor: playerOnCell.character.color }
                  : undefined
              }
            >
              {playerOnCell && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold">
                  {playerOnCell.character.symbol}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
