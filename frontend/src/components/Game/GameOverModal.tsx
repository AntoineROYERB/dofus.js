import React from "react";

interface GameOverModalProps {
  winner: string;
  onPlayAgain: () => void;
  onExit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  onPlayAgain,
  onExit,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          Game Over!
        </h2>
        <p className="text-lg text-gray-700 mb-6">
          <span className="font-semibold">{winner}</span> wins the game!
        </p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={onPlayAgain}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Play Again
          </button>
          <button
            onClick={onExit}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};