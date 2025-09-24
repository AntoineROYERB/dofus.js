import React from "react";
import { MainButton } from "./Button";
import { GameStatus, Position } from "../../types/game";

interface PlayerActionsProps {
  gameStatus: GameStatus;
  connected: boolean;
  handleReadyClick: () => void;
  handleEndTurnClick: () => void;
  isPlayerReady: boolean | undefined;
  isMyTurn: boolean | undefined;
  handleSubmitClick: () => void;
  userHasCharacter: boolean;
  handleFightClick: () => void;
  selectedPosition: Position | undefined;
  isPlayerPositioned: boolean | undefined;
}

export const PlayerActions: React.FC<PlayerActionsProps> = ({
  gameStatus,
  connected,
  handleReadyClick,
  handleEndTurnClick,
  isPlayerReady,
  isMyTurn,
  handleSubmitClick,
  userHasCharacter,
  handleFightClick,
  selectedPosition,
  isPlayerPositioned,
}) => {
  return (
    <div className="w-full max-w-sm mx-auto rounded-lg shadow-md p-6">
      {/* Button is at the bottom */}
      <div className="flex-shrink-0 pt-2">
        <MainButton
          gameStatus={gameStatus}
          connected={connected}
          handleReadyClick={handleReadyClick}
          handleEndTurnClick={handleEndTurnClick}
          isPlayerReady={isPlayerReady}
          isMyTurn={isMyTurn}
          handleSubmitClick={handleSubmitClick}
          userHasCharacter={userHasCharacter}
          handleFightClick={handleFightClick}
          selectedPosition={selectedPosition}
          isPlayerPositioned={isPlayerPositioned}
        />
      </div>
    </div>
  );
};
