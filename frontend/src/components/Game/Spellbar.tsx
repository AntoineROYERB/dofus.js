import React, { useState } from "react";
import { Heart, Star, Diamond, LucideIcon } from "lucide-react";

interface Spell {
  id: number;
  name: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  APCost: number;
  range: number;
  needsLineOfSight: boolean;
  maxCastsPerTurn: number;
  areaOfEffect: "none" | "circle" | "cross" | "line";
  damage: number;
  description?: string;

  type?: "Fire" | "Water" | "Air" | "Earth" | "Neutral";
  criticalChance?: number; // in %
  criticalDamage?: number;
  castInLineOnly?: boolean;
  castOnEmptyCell?: boolean;
  cooldown?: number; // in turns
  isWeapon?: boolean;
}

const SPELLS: Spell[] = [
  {
    id: 1,
    name: "Fireball",
    bgColor: "bg-red-100",
    borderColor: "border-red-600",
    icon: "🔥",
    APCost: 4,
    range: 6,
    needsLineOfSight: true,
    maxCastsPerTurn: 2,
    areaOfEffect: "circle",
    damage: 30,
    description:
      "🔴 Type: Fire\n🧪 Damage: 30 (45 crit.)\n💧 Cost: 4 AP\n🎯 Range: 6\n📏 AoE: Circle\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Fire",
    criticalChance: 15,
    criticalDamage: 45,
    castInLineOnly: false,
    castOnEmptyCell: false,
    cooldown: 1,
    isWeapon: false,
  },
  {
    id: 2,
    name: "Ice Spike",
    bgColor: "bg-blue-100",
    borderColor: "border-blue-600",
    icon: "❄️",
    APCost: 3,
    range: 5,
    needsLineOfSight: true,
    maxCastsPerTurn: 3,
    areaOfEffect: "line",
    damage: 20,
    description:
      "🔵 Type: Water\n🧪 Damage: 20 (30 crit.)\n💧 Cost: 3 AP\n🎯 Range: 5\n📏 AoE: Line\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Water",
    criticalChance: 10,
    criticalDamage: 30,
    castInLineOnly: true,
    castOnEmptyCell: false,
    cooldown: 0,
    isWeapon: false,
  },
  {
    id: 3,
    name: "Poison Dart",
    bgColor: "bg-green-100",
    borderColor: "border-green-700",
    icon: "☠️",
    APCost: 2,
    range: 4,
    needsLineOfSight: true,
    maxCastsPerTurn: 4,
    areaOfEffect: "none",
    damage: 10,
    description:
      "🟢 Type: Air\n🧪 Damage: 10 (15 crit.)\n💧 Cost: 2 AP\n🎯 Range: 4\n📏 AoE: None\n👁️ Line of Sight: Yes\n♻️ Cooldown: 1 turn",
    type: "Air",
    criticalChance: 20,
    criticalDamage: 15,
    castInLineOnly: false,
    castOnEmptyCell: true,
    cooldown: 0,
    isWeapon: false,
  },
];

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
}

const SpellBar: React.FC<SpellBarProps> = ({ handleSpellClick }) => {
  const [selectedSpellId, setSelectedSpellId] = useState<number | null>(null);
  const [health, _] = useState({ current: 100, max: 100 });

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
                  const newSelected =
                    selectedSpellId === spell.id ? null : spell.id;
                  setSelectedSpellId(newSelected);
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
    <div className="flex w-full h-full">
      <div className="bg-white rounded-md shadow-md border border-gray-300 flex w-full">
        <div className="flex-none flex flex-col items-center justify-center p-2 w-1/6">
          <HeartStat current={health.current} max={health.max} />
          <div className="flex mt-2 w-full justify-center">
            <StatIcon Icon={Star} color="#2563eb" fill="#2563eb" value={6} />
            <StatIcon Icon={Diamond} color="#16a34a" fill="#16a34a" value={3} />
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center p-1 sm:p-2">
          {SpellRow(0, 10)}
          {SpellRow(10, 20)}
        </div>
      </div>
    </div>
  );
};

export default SpellBar;
