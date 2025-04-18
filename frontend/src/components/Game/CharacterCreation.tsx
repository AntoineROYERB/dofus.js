// src/components/Game/CharacterCreation.tsx
import React, { useState } from "react";

const PLAYER_COLORS = [
  "red",
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "teal",
  "indigo",
];

interface CharacterCreationProps {
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  handleColorClick: (color: string) => void;
  handleCharacterName: (name: string) => void;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({
  selectedColor,
  handleColorClick,
  handleCharacterName,
}) => {
  const [characterName, setCharacterName] = useState("");
  return (
    <div className="mb-4 p-4 border rounded-lg">
      <h3 className="text-lg font-bold mb-4">Create Your Character</h3>
      <div className="space-y-4">
        {/* Name Input */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Character Name:
          </label>
          <input
            value={characterName}
            onChange={(e) => {
              setCharacterName(e.target.value);

              handleCharacterName(e.target.value);
            }}
            className="w-full p-2 border rounded"
            placeholder="Enter character name"
          />
        </div>

        {/* Color Selection */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Choose Color:
          </label>
          <div className="flex gap-2 flex-wrap">
            {PLAYER_COLORS.map((color) => (
              <div
                key={color}
                onClick={() => handleColorClick(color)}
                className={`w-8 h-8 rounded-full cursor-pointer ${
                  color === selectedColor
                    ? "ring-2 ring-offset-2 ring-black"
                    : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
