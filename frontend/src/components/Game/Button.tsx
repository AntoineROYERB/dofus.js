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
  isMyTurn, // Don't forget to pass this prop to the component
  handleSubmitClick,
  userHasCharacter,
}) => {
  return (
    <div className="flex justify-between">
      {/* Create Button */}

      {gameStatus === "creating_player" && userHasCharacter && (
        <button
          className="w-full  bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          disabled={!connected || isPlayerReady}
          onClick={handleReadyClick}
        >
          {isPlayerReady ? "Waiting for others..." : "Ready ?"}
        </button>
      )}
      {/* {gameStatus === "waiting" && !isPlayerReady && (
        <button
          className="w-full py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          disabled={!connected || isPlayerReady}
          onClick={handleStartGame}
        >
          {isPlayerReady ? "Waiting for others..." : "Ready ?"}
        </button>
      )} */}
      {gameStatus === "playing" && (
        <button
          className="w-full py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          disabled={!isMyTurn}
          onClick={handleEndTurn}
        >
          End Turn
        </button>
      )}
      {gameStatus === "creating_player" && !userHasCharacter && (
        <button
          className="w-full py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          disabled={!connected || isPlayerReady}
          onClick={handleSubmitClick}
        >
          Create Character
        </button>
      )}
    </div>
  );
};
