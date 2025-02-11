// src/components/Game/CharacterCreation.tsx
import React, { useState } from "react";
import { Position, Character, CreateCharacterAction } from "../../types/game";
import { generateMessageId } from "../../providers/WebSocketProvider";
import { Grid } from "./Grid";

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
  userId: string;
  userName: string;
  sendGameAction: (action: CreateCharacterAction) => void;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  selectedPosition: Position;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({
  userId,
  userName,
  sendGameAction,
  selectedColor,
  setSelectedColor,
  selectedPosition,
}) => {
  const [characterName, setCharacterName] = useState("");

  const handleCreateCharacter = () => {
    const { messageId, timestamp } = generateMessageId();

    sendGameAction({
      type: "create_character",
      messageId,
      timestamp,
      character: {
        name: characterName,
        color: selectedColor,
        symbol: characterName ? characterName[0].toUpperCase() : "P",
        position: selectedPosition,
        actionPoints: 6,
        movementPoints: 3,
        isCurrentTurn: false,
      },
      userId,
      userName,
      isCurrentTurn: false,
    });
  };

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
            onChange={(e) => setCharacterName(e.target.value)}
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
                onClick={() => setSelectedColor(color)}
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
        {/* Create Button */}
        <button
          onClick={handleCreateCharacter}
          className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Create Character
        </button>
      </div>
    </div>
  );
};
