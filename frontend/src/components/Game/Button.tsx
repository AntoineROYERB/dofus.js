interface mainButtonProps {
  gameStatus: string;
  connected: boolean;
  handleReadyClick: () => void;
  handleEndTurn: () => void;
  isPlayerReady: boolean | undefined;
  isMyTurn: boolean | undefined;
  handleSubmitClick: () => void;
  userHasCharacter: boolean;
}

export const MainButton: React.FC<mainButtonProps> = ({
  gameStatus,
  connected,
  handleReadyClick,
  handleEndTurn,
  isPlayerReady,
  isMyTurn,
  handleSubmitClick,
  userHasCharacter,
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
          onClick={handleEndTurn}
        >
          End Turn
        </button>
      )}

      {gameStatus === "creating_player" && !userHasCharacter && (
        <button
          className="w-full bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 text-sm"
          disabled={!connected || isPlayerReady}
          onClick={handleSubmitClick}
        >
          Create Character
        </button>
      )}
    </div>
  );
};
