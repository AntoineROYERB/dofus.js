import React from "react";
import { Position } from "../../types/game";
import { GameState } from "../../types/message";
import { Grid } from "./Grid/Grid";
import { AimedAction } from "../../utils/touchConfirm";

interface GameBoardProps {
  gridSize: number;
  handleSelectedPosition: (position: Position | null) => void;
  selectedPosition: Position | null;
  selectedSpellId: number | null;
  handleCellClick: (position: Position) => void;
  latestGameState: GameState | null;
  userId: string;
  onAimChange?: (aimed: AimedAction | null) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gridSize,
  selectedPosition,
  handleCellClick,
  latestGameState,
  userId,
  selectedSpellId,
  onAimChange,
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
          onAimChange={onAimChange}
        />
      </div>
    </div>
  );
};
