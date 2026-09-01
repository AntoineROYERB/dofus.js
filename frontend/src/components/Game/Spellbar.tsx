import React from "react";
import { Heart, Star, Diamond, LucideIcon } from "lucide-react";
import { Player } from "../../types/game";
import { Spell, SpellBook } from "../../types/message";

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
  selectedSpellId: number | null;
  currentPlayer: Player | undefined;
  /** The catalogue broadcast by the server; the client keeps no copy. */
  spells: SpellBook | null;
}

const SLOTS_PER_ROW = 10;

const Tooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-white text-gray-800 text-xs p-2 rounded-md border border-gray-300 shadow-xl whitespace-pre-line">
    {text}
  </div>
);

const HeartStat: React.FC<{ current: number; max: number }> = ({
  current,
  max,
}) => (
  <div className="relative w-full aspect-square max-w-full">
    <Heart className="text-red-600 w-full h-full" fill="red" stroke="red" />
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-xs text-white font-bold">{current}</span>
      <span className="text-xs text-white font-bold">{max}</span>
    </div>
  </div>
);

const StatIcon: React.FC<{
  Icon: LucideIcon;
  color: string;
  value: number;
}> = ({ Icon, color, value }) => (
  <div className="w-1/2 aspect-square relative flex items-center justify-center">
    <Icon className="w-full h-full" color={color} fill={color} stroke={color} />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-white text-sm sm:text-base font-bold">{value}</span>
    </div>
  </div>
);

const SpellSlot: React.FC<{
  spell: Spell | null;
  isSelected: boolean;
  isAffordable: boolean;
  onSelect: (spellId: number) => void;
}> = ({ spell, isSelected, isAffordable, onSelect }) => {
  if (!spell) {
    return (
      <div className="aspect-square border-2 rounded-md bg-gray-100 border-gray-300" />
    );
  }

  return (
    <div className="relative group">
      <button
        type="button"
        // Colours come from the server as hex values and are applied inline.
        // Tailwind class names sent at runtime would be stripped by its build.
        style={{ backgroundColor: `${spell.color}22`, borderColor: spell.color }}
        className={`w-full aspect-square border-2 rounded-md flex items-center justify-center transition ${
          isSelected ? "brightness-125 shadow-md ring-2 ring-offset-1" : "hover:brightness-110"
        } ${isAffordable ? "" : "opacity-40 grayscale"}`}
        title={`${spell.name} — ${spell.APCost} AP`}
        aria-pressed={isSelected}
        onClick={() => onSelect(spell.id)}
      >
        <span className="text-xs sm:text-sm md:text-base lg:text-lg">
          {spell.icon}
        </span>
      </button>
      <div className="hidden group-hover:block">
        <Tooltip text={`${spell.name}\n${spell.description}`} />
      </div>
    </div>
  );
};

const SpellBar: React.FC<SpellBarProps> = ({
  handleSpellClick,
  selectedSpellId,
  currentPlayer,
  spells,
}) => {
  const catalogue = React.useMemo(
    () =>
      Object.values(spells ?? {}).sort((a, b) => a.id - b.id),
    [spells]
  );

  const actionPoints = currentPlayer?.character?.actionPoints ?? 0;

  const row = (start: number) => {
    const slots: (Spell | null)[] = Array.from(
      { length: SLOTS_PER_ROW },
      (_, i) => catalogue[start + i] ?? null
    );

    return (
      <div className="grid grid-cols-10 gap-1 mb-1 last:mb-0">
        {slots.map((spell, index) => (
          <SpellSlot
            key={spell ? spell.id : `empty-${start + index}`}
            spell={spell}
            isSelected={!!spell && selectedSpellId === spell.id}
            isAffordable={!spell || actionPoints >= spell.APCost}
            onSelect={handleSpellClick}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-2">
      <div className="flex w-full h-full">
        <div className="bg-white rounded-md shadow-md border border-gray-300 flex w-full">
          <div className="flex-none flex flex-col items-center justify-center p-2 w-1/6">
            <HeartStat
              current={currentPlayer?.character?.health ?? 0}
              max={currentPlayer?.character?.maxHealth ?? 100}
            />
            <div className="flex mt-2 w-full justify-center">
              <StatIcon Icon={Star} color="#2563eb" value={actionPoints} />
              <StatIcon
                Icon={Diamond}
                color="#16a34a"
                value={currentPlayer?.character?.movementPoints ?? 0}
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center p-1 sm:p-2">
            {row(0)}
            {row(SLOTS_PER_ROW)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpellBar;
