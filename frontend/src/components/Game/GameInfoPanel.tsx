import React from "react";
import { PlayerMessage, GameStateMessage } from "../../types/message";
import { MainButton } from "./Button";
import { GameStatus, Position } from "../../types/game";

interface GameInfoPanelProps {
  currentPlayer: PlayerMessage | undefined;
  connected: boolean;
  latestGameState: GameStateMessage | null;
  gameStatus: GameStatus;
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

export const GameInfoPanel: React.FC<GameInfoPanelProps> = ({
  currentPlayer,
  connected,
  latestGameState,
  gameStatus,
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
  const totalPlayers = latestGameState?.players
    ? Object.keys(latestGameState?.players).length
    : 0;

  // Count ready players and get their names
  const readyPlayers = latestGameState?.players
    ? Object.values(latestGameState.players).filter((player) => player.isReady)
    : [];

  const readyPlayersCount = readyPlayers.length;
  const readyPlayersNames = readyPlayers.map((player) => player.userName);

  return (
    <div className="p-2 text-sm h-full">
      {currentPlayer && (
        <>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentPlayer.character?.color }}
              />
              <span className="font-medium truncate">
                {currentPlayer?.character?.name}
              </span>
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
            </div>
            {latestGameState && (
              <span className="text-xs">
                Turn: {latestGameState?.turnNumber || 0}
                {isMyTurn && (
                  <span className="ml-1 text-green-500 font-bold">
                    Your Turn!
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mb-2 text-xs">
            <div className="flex justify-between">
              <span>AP: {currentPlayer.character?.actionPoints}</span>
              <span>MP: {currentPlayer.character?.movementPoints}</span>
            </div>
          </div>

          {/* Player Status Display */}
          <div className="text-xs text-gray-600">
            <div>Connected Players: {totalPlayers}</div>
            <div className="truncate">
              Ready: {readyPlayersCount}/{totalPlayers}
              {readyPlayersCount > 0 && (
                <div className="italic text-xs truncate">
                  Ready: {readyPlayersNames.join(", ")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
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
