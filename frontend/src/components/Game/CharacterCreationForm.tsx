import React, { useState } from "react";
import { PLAYER_COLORS } from "../../constants";

interface CharacterCreationFormProps {
  characterName: string;
  setCharacterName: (name: string) => void;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  isNameValid: boolean;
  setIsNameValid: (isValid: boolean) => void;
}

export const CharacterCreationForm: React.FC<CharacterCreationFormProps> = ({
  characterName,
  setCharacterName,
  selectedColor,
  setSelectedColor,
  isNameValid,
  setIsNameValid,
}) => {
  const validateName = (name: string) => {
    const isValid = /^[a-zA-Z0-9 ]{3,20}$/.test(name);
    setIsNameValid(isValid);
    return isValid;
  };

  return (
    <div className="w-full max-w-sm mx-auto rounded-lg p-6">
      <div className="mb-4">
        <div className="flex items-center space-x-2">
          <input
            id="characterName"
            type="text"
            value={characterName}
            onChange={(e) => {
              const newName = e.target.value;
              setCharacterName(newName);
              validateName(newName);
            }}
            className="flex-1 h-10 px-3 bg-gray-700 text-white border border-gray-600 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Enter name"
          />
        </div>
        <div className="h-6">
          <p
            className={`text-sm text-red-400 transition-opacity duration-200 ${
              !characterName || isNameValid ? "opacity-0" : "opacity-100"
            }`}
          >
            Name must be 3-20 characters long and contain only letters, numbers,
            and spaces
          </p>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Choose Color
        </label>
        <div className="flex justify-center gap-2 flex-wrap">
          {PLAYER_COLORS.map((color) => (
            <div
              key={color}
              onClick={() => setSelectedColor(color)}
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
    </div>
  );
};