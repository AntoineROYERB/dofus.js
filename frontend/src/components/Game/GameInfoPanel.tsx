import React from "react";
import { GameState } from "../../types/message";
import { MainButton } from "./Button";
import { TurnClock } from "./TurnClock";
import { GameStatus, Player, Position } from "../../types/game";

interface GameInfoPanelProps {
  currentPlayer: Player | undefined;
  connected: boolean;
  latestGameState: GameState | null;
  gameStatus: GameStatus;
  handleReadyClick: () => void;
  handleEndTurnClick: () => void;
  isPlayerReady: boolean | undefined;
  isMyTurn: boolean | undefined;
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
  const opponents = latestGameState?.players
    ? Object.values(latestGameState.players).filter(
        (player) => player.userId !== currentPlayer?.userId
      )
    : [];

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
              <span className="text-xs flex items-center gap-2">
                <span>Turn: {latestGameState?.turnNumber || 0}</span>
                <TurnClock
                  turnEndsAt={latestGameState?.turnEndsAt ?? 0}
                  isMyTurn={!!isMyTurn}
                />
                {isMyTurn && (
                  <span className="text-green-600 font-bold">Your turn</span>
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

          <div className="text-xs text-gray-600 flex flex-col gap-1">
            <div>
              Players: {totalPlayers} &middot; ready {readyPlayersCount}/
              {totalPlayers}
            </div>
            <ul className="flex flex-col gap-0.5">
              {opponents.map((player) => (
                <li
                  key={player.userId}
                  className="flex items-center gap-2 truncate"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-none"
                    style={{ backgroundColor: player.character.color }}
                  />
                  <span className="truncate">{player.character.name}</span>
                  {player.isBot && (
                    <span className="text-[10px] uppercase tracking-wide text-violet-600">
                      cpu
                    </span>
                  )}
                  {!player.isBot && !player.connected && (
                    // The character stays on the board during the grace period,
                    // so say why nothing is happening on their turn.
                    <span className="text-[10px] uppercase tracking-wide text-amber-600">
                      away
                    </span>
                  )}
                  {!player.character.isAlive && (
                    <span className="text-[10px] uppercase tracking-wide text-red-600">
                      out
                    </span>
                  )}
                  <span className="ml-auto tabular-nums">
                    {player.character.health}
                  </span>
                </li>
              ))}
            </ul>
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
          userHasCharacter={userHasCharacter}
          handleFightClick={handleFightClick}
          selectedPosition={selectedPosition}
          isPlayerPositioned={isPlayerPositioned}
        />
      </div>
    </div>
  );
};
