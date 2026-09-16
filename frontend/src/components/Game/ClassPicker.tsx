import React from "react";
import { CharacterClass, SpellBook } from "../../types/message";

interface ClassPickerProps {
  classes: CharacterClass[];
  spells: SpellBook;
  selected: string | null;
  onSelect: (classId: string) => void;
}

/**
 * The third choice on the landing page, after a name and a colour, and the
 * only one that changes how the fight plays. Four squares in a row, like the
 * colours above them; what the picked class actually is — its numbers, its
 * spells, what it is for — reads underneath, so a choice is never made blind.
 */
export const ClassPicker: React.FC<ClassPickerProps> = ({
  classes,
  spells,
  selected,
  onSelect,
}) => {
  const current = classes.find((c) => c.id === selected) ?? classes[0];

  return (
    <div className="mt-4">
      <p className="font-mono text-[9.5px] uppercase tracking-label text-muted">
        Class
      </p>
      <div
        role="radiogroup"
        aria-label="Class"
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(classes.length, 4)}, minmax(0, 1fr))` }}
      >
        {classes.map((cls) => {
          const isSelected = cls.id === current?.id;
          return (
            <button
              key={cls.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(cls.id)}
              className={`relative flex flex-col items-center gap-0.5 border px-1 pb-1.5 pt-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                isSelected
                  ? "border-ink bg-board"
                  : "border-rule hover:border-graphite"
              }`}
            >
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5"
                style={{ backgroundColor: cls.palette.primary }}
              />
              <span aria-hidden className="text-[18px] leading-none">
                {cls.symbol}
              </span>
              <span className="w-full truncate text-center font-display text-[11.5px] font-bold leading-tight tracking-tight sm:text-[12.5px]">
                {cls.name}
              </span>
            </button>
          );
        })}
      </div>

      {current && (
        <div className="mt-2.5 min-h-[64px] text-[12.5px] leading-snug text-graphite short:min-h-0">
          <p className="font-mono text-[9.5px] uppercase tracking-label text-ink">
            {current.element} · {current.health} hp · {current.actionPoints} ap ·{" "}
            {current.movementPoints} mp
          </p>
          <p className="mt-1 short:hidden">{current.lore}</p>
          <p className="mt-1 truncate text-[11.5px] text-muted" title={spellNames(current, spells)}>
            {spellNames(current, spells)}
          </p>
        </div>
      )}
    </div>
  );
};

const spellNames = (cls: CharacterClass, spells: SpellBook): string =>
  cls.spells
    .map((id) => spells[id]?.name)
    .filter(Boolean)
    .join(" · ");
