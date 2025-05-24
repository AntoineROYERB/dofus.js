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
  // print characters
  console.log("Latest Game State:", latestGameState?.players);
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
