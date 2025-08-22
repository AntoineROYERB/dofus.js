import React, { useState } from "react";
import { PLAYER_COLORS } from "../../constants";
import { MainButton } from "./Button";
import { GameStatus, Position } from "../../types/game";

interface CharacterCreationProps {
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  handleColorClick: (color: string) => void;
  handleCharacterName: (name: string) => void;
  gameStatus: GameStatus;
  connected: boolean;
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

export const CharacterCreation: React.FC<CharacterCreationProps> = ({
  selectedColor,
  handleColorClick,
  handleCharacterName,
  gameStatus,
  connected,
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
  const [characterName, setCharacterName] = useState("");

  return (
    <div className="w-full max-w-sm mx-auto bg-gray-800 rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-white text-center mb-4">
        Create Your Character
      </h3>

      {/* Name Input */}
      <div className="mb-4">
        <label
          htmlFor="characterName"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Character Name
        </label>
        <input
          id="characterName"
          type="text"
          value={characterName}
          onChange={(e) => {
            setCharacterName(e.target.value);
            handleCharacterName(e.target.value);
          }}
          className="w-full py-2 px-3 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          placeholder="Enter name"
        />
      </div>

      {/* Color Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Choose Color
        </label>
        <div className="flex justify-center gap-2 flex-wrap">
          {PLAYER_COLORS.map((color) => (
            <div
              key={color}
              onClick={() => handleColorClick(color)}
              className={`w-8 h-8 rounded-full cursor-pointer transition transform hover:scale-110 ${
                color === selectedColor
                  ? "ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500"
                  : "ring-1 ring-gray-600"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
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
