import React from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";
import { Grid } from "./Grid";

interface GameBoardProps {
  gridSize: number;
  handleSelectedPosition: (position: Position) => void;
  selectedPosition: Position;
  selectedSpellId: number | null;
  handleCellClick: (position: Position) => void;
  selectedColor: string;
  latestGameState: GameStateMessage | null;
  userId: string;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gridSize,
  selectedPosition,
  handleCellClick,
  selectedColor,
  latestGameState,
  userId,
}) => {
  return (
    <div className="flex flex-col h-full">
      <Grid
        gridSize={gridSize}
        selectedPosition={selectedPosition}
        onCellClick={handleCellClick}
        selectedColor={selectedColor}
        latestGameState={latestGameState}
        userId={userId}
      />
    </div>
  );
};
