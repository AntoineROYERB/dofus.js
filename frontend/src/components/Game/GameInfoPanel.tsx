import React from "react";
import { PlayerMessage, GameStateMessage } from "../../types/message";

interface GameInfoPanelProps {
  currentPlayer: PlayerMessage | undefined;
  connected: boolean;
  gameStatus: string;
  gameRecord: GameStateMessage[];
}

export const GameInfoPanel: React.FC<GameInfoPanelProps> = ({
  currentPlayer,
  connected,
  gameStatus,
  gameRecord,
}) => {
  const latestGameState =
    gameRecord.length > 0 ? gameRecord[gameRecord.length - 1] : null;
  const totalPlayers = latestGameState?.players
    ? Object.keys(latestGameState?.players).length
    : 0;

  const readyPlayersCount = latestGameState?.players
    ? Object.values(latestGameState.players).filter(
        (player) => player.status === "waiting-room"
      ).length
    : 0; // Retourne 0 si latestGameState ou latestGameState.players est null/undefined

  const readyPlayersNames = latestGameState?.players
    ? Object.values(latestGameState.players)
        .filter((player) => player.status === "waiting-room")
        .map((player) => player.userName)
    : []; // Retourne un tableau vide si latestGameState ou latestGameState.players est null/undefined
  const isMyTurn = false;

  console.log("qjefnqou", latestGameState?.turnNumber);
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

          {/* Update status display */}
          {gameStatus === "starting" && (
            <div className="text-sm text-gray-600 mb-2">
              <div>Total Players: {totalPlayers}</div>
              <div>
                Players Ready: {readyPlayersCount}/{totalPlayers}
                {readyPlayersCount > 0 && (
                  <span className="ml-2 italic">({readyPlayersNames})</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
