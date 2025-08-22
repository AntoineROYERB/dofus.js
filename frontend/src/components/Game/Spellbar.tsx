import React from "react";
import { Heart, Star, Diamond, LucideIcon } from "lucide-react";
import { SPELLS } from "../../../data/spells";
import { PlayerMessage } from "../../types/message";

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
  selectedSpellId: number | null;
  currentPlayer: PlayerMessage | undefined;
}

const SpellBar: React.FC<SpellBarProps> = ({
  handleSpellClick,
  selectedSpellId,
  currentPlayer,
}) => {
  const Tooltip: React.FC<{ text: string }> = ({ text }) => (
    <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-white text-gray-800 text-xs p-2 rounded-md border border-gray-300 shadow-xl whitespace-pre-line">
      {text}
    </div>
  );

  const SpellRow = (start: number, end: number) => {
    const spellsSlice = SPELLS.slice(start, end);
    const spells = [
      ...spellsSlice,
      ...Array(10 - spellsSlice.length).fill(null),
    ];

    return (
      <div className="grid grid-cols-10 gap-1 mb-1 last:mb-0">
        {spells.map((spell, index) => (
          <div
            key={spell ? spell.id : `empty-${start + index}`}
            className="relative group"
          >
            <div
              className={`aspect-square border-2 rounded-md flex items-center justify-center overflow-hidden transition ${
                spell
                  ? `${spell.bgColor} ${spell.borderColor}`
                  : "bg-gray-100 border-gray-300"
              } ${
                spell && selectedSpellId === spell.id
                  ? "brightness-125 shadow-md"
                  : spell
                  ? "hover:brightness-110 hover:shadow-sm"
                  : ""
              }`}
              title={spell?.name ?? ""}
              onClick={() => {
                if (spell) {
                  handleSpellClick(spell.id);
                }
              }}
            >
              <span className="text-xs sm:text-sm md:text-base lg:text-lg">
                {spell?.icon ?? ""}
              </span>
            </div>

            {spell?.description && (
              <div className="hidden group-hover:block">
                <Tooltip text={spell.description} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  interface HeartStatProps {
    current: number;
    max: number;
  }

  const HeartStat: React.FC<HeartStatProps> = ({ current, max }) => {
    return (
      <div className="relative w-full aspect-square max-w-full">
        <Heart className="text-red-600 w-full h-full" fill="red" stroke="red" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-white font-bold">{current}</span>
          <span className="text-xs text-white font-bold">{max}</span>
        </div>
      </div>
    );
  };

  interface StatIconProps {
    Icon: LucideIcon;
    color: string;
    fill: string;
    value: number;
  }

  const StatIcon: React.FC<StatIconProps> = ({ Icon, color, fill, value }) => {
    return (
      <div className="w-1/2 aspect-square relative flex items-center justify-center">
        <Icon
          className={`w-full h-full`}
          color={color}
          fill={fill}
          stroke={color}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-sm sm:text-base font-bold">
            {value}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-2  overflow-y-auto">
      <div className="flex w-full h-full">
        <div className="bg-white rounded-md shadow-md border border-gray-300 flex w-full">
          <div className="flex-none flex flex-col items-center justify-center p-2 w-1/6">
            <HeartStat
              current={currentPlayer?.character?.health ?? 0}
              max={100} // Assuming max health is 100 for now
            />
            <div className="flex mt-2 w-full justify-center">
              <StatIcon
                Icon={Star}
                color="#2563eb"
                fill="#2563eb"
                value={currentPlayer?.character?.actionPoints ?? 0}
              />
              <StatIcon
                Icon={Diamond}
                color="#16a34a"
                fill="#16a34a"
                value={currentPlayer?.character?.movementPoints ?? 0}
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center p-1 sm:p-2">
            {SpellRow(0, 10)}
            {SpellRow(10, 20)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpellBar;
