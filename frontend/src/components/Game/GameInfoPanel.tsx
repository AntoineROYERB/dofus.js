import React from "react";
import { PlayerMessage, GameStateMessage } from "../../types/message";

interface GameInfoPanelProps {
  currentPlayer: PlayerMessage | undefined;
  connected: boolean;
  gameRecord: GameStateMessage[];
}

export const GameInfoPanel: React.FC<GameInfoPanelProps> = ({
  currentPlayer,
  connected,
  gameRecord,
}) => {
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;

  const totalPlayers = latestGameState?.players
    ? Object.keys(latestGameState?.players).length
    : 0;

  // Count ready players and get their names
  const readyPlayers = latestGameState?.players
    ? Object.values(latestGameState.players).filter((player) => player.isReady)
    : [];

  const readyPlayersCount = readyPlayers.length;
  const readyPlayersNames = readyPlayers.map((player) => player.userName);

  // Check if it's current player's turn
  const isMyTurn = currentPlayer?.isCurrentTurn || false;

  return (
    <div className="p-2 text-sm h-full">
      currentPlayer &&
      <div className="mb-2 flex justify-between items-center">
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
        {gameRecord && (
          <span className="text-xs">
            Turn: {latestGameState?.turnNumber}
            {isMyTurn && (
              <span className="ml-1 text-green-500 font-bold">Your Turn!</span>
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
    </div>
  );
};
