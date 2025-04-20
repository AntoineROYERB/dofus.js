import React, { useState } from "react";
import { Heart, Star, Diamond } from "lucide-react";

interface Spell {
  id: number;
  name: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const SpellBar: React.FC = () => {
  const [health, setHealth] = useState({ current: 100, max: 100 });

  const spells: Spell[] = [
    {
      id: 1,
      name: "Spell 1",
      bgColor: "bg-amber-100",
      borderColor: "border-amber-700",
      icon: "🔮",
    },
    {
      id: 2,
      name: "Spell 2",
      bgColor: "bg-stone-200",
      borderColor: "border-stone-600",
      icon: "⚗️",
    },
    {
      id: 3,
      name: "Spell 3",
      bgColor: "bg-green-100",
      borderColor: "border-green-700",
      icon: "🌿",
    },
    {
      id: 4,
      name: "Spell 4",
      bgColor: "bg-red-100",
      borderColor: "border-red-600",
      icon: "🔥",
    },
    {
      id: 5,
      name: "Spell 5",
      bgColor: "bg-gray-200",
      borderColor: "border-gray-700",
      icon: "⚔️",
    },
    {
      id: 6,
      name: "Spell 6",
      bgColor: "bg-amber-200",
      borderColor: "border-amber-800",
      icon: "🛡️",
    },
    {
      id: 7,
      name: "Spell 7",
      bgColor: "bg-purple-100",
      borderColor: "border-purple-600",
      icon: "✨",
    },
    {
      id: 8,
      name: "Spell 8",
      bgColor: "bg-pink-100",
      borderColor: "border-pink-700",
      icon: "💕",
    },
    {
      id: 9,
      name: "Spell 9",
      bgColor: "bg-cyan-100",
      borderColor: "border-cyan-600",
      icon: "💧",
    },
    {
      id: 10,
      name: "Spell 10",
      bgColor: "bg-purple-200",
      borderColor: "border-purple-700",
      icon: "🌀",
    },
    {
      id: 11,
      name: "Spell 11",
      bgColor: "bg-amber-100",
      borderColor: "border-amber-700",
      icon: "🏺",
    },
    {
      id: 12,
      name: "Spell 12",
      bgColor: "bg-stone-200",
      borderColor: "border-stone-600",
      icon: "🗿",
    },
    {
      id: 13,
      name: "Spell 13",
      bgColor: "bg-amber-200",
      borderColor: "border-amber-800",
      icon: "🪙",
    },
    {
      id: 14,
      name: "Spell 14",
      bgColor: "bg-blue-100",
      borderColor: "border-blue-600",
      icon: "❄️",
    },
    {
      id: 15,
      name: "Spell 15",
      bgColor: "bg-gray-200",
      borderColor: "border-gray-700",
      icon: "🗡️",
    },
    {
      id: 16,
      name: "Spell 16",
      bgColor: "bg-yellow-100",
      borderColor: "border-yellow-600",
      icon: "⚡",
    },
    {
      id: 17,
      name: "Spell 17",
      bgColor: "bg-amber-100",
      borderColor: "border-amber-700",
      icon: "🌟",
    },
    {
      id: 18,
      name: "Spell 18",
      bgColor: "bg-pink-100",
      borderColor: "border-pink-700",
      icon: "🌸",
    },
    {
      id: 19,
      name: "Spell 19",
      bgColor: "bg-amber-200",
      borderColor: "border-amber-800",
      icon: "🔱",
    },
    {
      id: 20,
      name: "Spell 20",
      bgColor: "bg-purple-100",
      borderColor: "border-purple-600",
      icon: "🔮",
    },
  ];

  return (
    <div className="flex w-full h-full">
      <div className="bg-white rounded-md shadow-md border border-gray-300 flex w-full">
        {/* First column: contains the heart and action buttons */}
        <div className="flex-none flex flex-col items-center justify-center p-2 w-1/6">
          {/* Red heart icon with health points inside */}
          <div className="relative w-full aspect-square max-w-full">
            {/* Heart icon - responsive size */}
            <Heart className="text-red-600 fill-red-600 w-full h-full" />

            {/* Health points displayed over the heart */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-white font-bold">
                {health.current}
              </span>
              <span className="text-xs text-white font-bold">{health.max}</span>
            </div>
          </div>

          {/* Action buttons below the heart */}
          <div className="flex mt-2 w-full justify-center">
            {/* Star with a number inside */}
            <div className="w-1/2 aspect-square relative flex items-center justify-center">
              <Star className="text-blue-600 fill-blue-600 w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm sm:text-base">6</span>
              </div>
            </div>

            {/* Diamond with a number inside */}
            <div className="w-1/2 aspect-square relative flex items-center justify-center">
              <Diamond className="text-green-600 fill-green-600 w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm sm:text-base">3</span>
              </div>
            </div>
          </div>
        </div>

        {/* Second column: contains two rows of spells */}
        <div className="flex-1 flex flex-col justify-center p-1 sm:p-2">
          {/* Spell bar - row 1 */}
          <div className="grid grid-cols-10 gap-1 mb-1">
            {spells.slice(0, 10).map((spell) => (
              <div
                key={spell.id}
                className={`aspect-square ${spell.bgColor} ${spell.borderColor} border-2 rounded-md flex items-center justify-center overflow-hidden`}
                title={spell.name}
              >
                <span className="text-xs sm:text-sm md:text-base lg:text-lg">
                  {spell.icon}
                </span>
              </div>
            ))}
          </div>

          {/* Spell bar - row 2 */}
          <div className="grid grid-cols-10 gap-1">
            {spells.slice(10, 20).map((spell) => (
              <div
                key={spell.id}
                className={`aspect-square ${spell.bgColor} ${spell.borderColor} border-2 rounded-md flex items-center justify-center overflow-hidden`}
                title={spell.name}
              >
                <span className="text-xs sm:text-sm md:text-base lg:text-lg">
                  {spell.icon}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpellBar;
