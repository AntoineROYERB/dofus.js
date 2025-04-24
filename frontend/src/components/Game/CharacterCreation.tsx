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
    <div className="p-2 flex-grow overflow-y-auto">
      <h3 className="text-sm font-medium mb-1">Create Your Character</h3>
      <div className="space-y-2">
        {/* Name Input */}
        <div>
          <label className="block text-xs font-medium mb-1">
            Character Name:
          </label>
          <input
            value={characterName}
            onChange={(e) => {
              setCharacterName(e.target.value);
              handleCharacterName(e.target.value);
            }}
            className="w-full py-1 px-2 border rounded text-sm"
            placeholder="Enter name"
          />
        </div>

        {/* Color Selection */}
        <div>
          <label className="block text-xs font-medium mb-1">
            Choose Color:
          </label>
          <div className="flex gap-1 flex-wrap">
            {PLAYER_COLORS.map((color) => (
              <div
                key={color}
                onClick={() => handleColorClick(color)}
                className={`w-6 h-6 rounded-full cursor-pointer ${
                  color === selectedColor
                    ? "ring-1 ring-offset-1 ring-black"
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
