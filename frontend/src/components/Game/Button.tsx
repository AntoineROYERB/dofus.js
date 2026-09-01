import { Position } from "../../types/game";

interface mainButtonProps {
  gameStatus: string;
  connected: boolean;
  handleReadyClick: () => void;
  handleEndTurnClick: () => void;
  handleFightClick: () => void;
  isPlayerReady: boolean | undefined;
  isMyTurn: boolean | undefined;
  userHasCharacter: boolean;
  selectedPosition: Position | undefined;
  isPlayerPositioned: boolean | undefined;
}

export const MainButton: React.FC<mainButtonProps> = ({
  gameStatus,
  connected,
  handleReadyClick,
  handleEndTurnClick,
  isPlayerReady,
  isMyTurn,
  handleFightClick,
  userHasCharacter,
  selectedPosition,
  isPlayerPositioned,
}) => {
  return (
    <div className="px-2">
      {gameStatus === "creating_player" && userHasCharacter && (
        <button
          className="w-full py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 text-sm"
          disabled={!connected || isPlayerReady}
          onClick={handleReadyClick}
        >
          {isPlayerReady ? "Waiting for others..." : "Ready ?"}
        </button>
      )}

      {gameStatus === "playing" && (
        <button
          className="w-full py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 text-sm"
          disabled={!isMyTurn}
          onClick={handleEndTurnClick}
        >
          End Turn
        </button>
      )}

      {gameStatus === "creating_player" && !userHasCharacter && (
        // The character is created automatically on entering a room, so there
        // is nothing for the player to click here.
        <p className="text-center text-xs text-gray-500 py-1">
          {connected ? "Joining the game…" : "Reconnecting…"}
        </p>
      )}

      {gameStatus === "position_characters" && (
        <button
          className="w-full py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 text-sm"
          disabled={!selectedPosition || isPlayerPositioned}
          onClick={handleFightClick}
        >
          {isPlayerPositioned ? "Waiting for others..." : "Fight"}
        </button>
      )}
    </div>
  );
};
