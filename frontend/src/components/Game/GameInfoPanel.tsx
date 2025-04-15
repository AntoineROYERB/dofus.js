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
    <>
      {currentPlayer && (
        <>
          <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: currentPlayer.character?.color }}
              />
              <span className="font-medium">
                {currentPlayer?.character?.name}
              </span>
              <span
                className={`ml-2 inline-block w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
            </div>
            {gameRecord && (
              <span className="text-sm">
                Turn: {latestGameState?.turnNumber}
                {isMyTurn && (
                  <span className="ml-2 text-green-500 font-bold">
                    Your Turn!
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mb-4 text-sm">
            <div className="flex justify-between">
              <span>AP: {currentPlayer.character?.actionPoints}</span>
              <span>MP: {currentPlayer.character?.movementPoints}</span>
            </div>
          </div>

          {/* Player Status Display */}
          <div className="text-sm text-gray-600 mb-2">
            <div>Connected Players: {totalPlayers}</div>
            <div>
              Ready: {readyPlayersCount}/{totalPlayers}
              {readyPlayersCount > 0 && (
                <div className="mt-1 italic text-xs">
                  Ready players: {readyPlayersNames.join(", ")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
