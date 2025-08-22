import React from "react";
import { Position } from "../../types/game";
import { GameStateMessage } from "../../types/message";
import { Grid } from "./Grid/Grid";

interface GameBoardProps {
  gridSize: number;
  handleSelectedPosition: (position: Position | null) => void;
  selectedPosition: Position | null;
  selectedSpellId: number | null;
  handleCellClick: (position: Position) => void;
  latestGameState: GameStateMessage | null;
  userId: string;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gridSize,
  selectedPosition,
  handleCellClick,
  latestGameState,
  userId,
  selectedSpellId,
}) => {
  return (
    <div className="absolute inset-0 z-0">
      <div className="flex flex-col h-full">
        <Grid
          gridSize={gridSize}
          selectedPosition={selectedPosition}
          onCellClick={handleCellClick}
          latestGameState={latestGameState}
          userId={userId}
          selectedSpellId={selectedSpellId}
        />
      </div>
    </div>
  );
};
