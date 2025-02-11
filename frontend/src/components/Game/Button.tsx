interface mainButtonProps {
  gameStatus: string;
  connected: boolean;
  handleStartGame: () => void;
  handleEndTurn: () => void;
  isPlayerReady: boolean;
  isMyTurn: boolean | undefined; // Assuming isMyTurn is a boolean that you forgot to define
}

export const MainButton: React.FC<mainButtonProps> = ({
  gameStatus,
  connected,
  handleStartGame,
  handleEndTurn,
  isPlayerReady,
  isMyTurn, // Don't forget to pass this prop to the component
}) => {
  return (
    <div className="mt-4 flex justify-between">
      {gameStatus === "waiting" && !isPlayerReady && (
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          disabled={!connected || isPlayerReady}
          onClick={handleStartGame}
        >
          {isPlayerReady ? "Waiting for others..." : "Ready"}
        </button>
      )}
      {gameStatus === "playing" && (
        <button
          className="px-4 py-2 bg-red-500 text-white rounded disabled:bg-gray-300 hover:bg-red-600"
          disabled={!isMyTurn}
          onClick={handleEndTurn}
        >
          End Turn
        </button>
      )}
    </div>
  );
};
