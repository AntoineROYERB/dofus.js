import React from "react";
import { ContentResponse, Loadout } from "../../types/message";
import { championOf, kitOf } from "../../utils/loadoutUtils";

interface SetPickerProps {
  content: ContentResponse;
  loadout: Loadout;
  onSelect: (loadout: Loadout) => void;
  /** Opens the wardrobe, where each piece can be changed on its own. */
  onOpenWardrobe: () => void;
}

/**
 * The third choice on the landing page, after a name and a colour, and the
 * only one that changes how the fight plays. Four squares in a row, like the
 * colours above them: each is a champion's whole set, the quickest way to be
 * dressed. What the character carries — its numbers, its spells, its rune —
 * reads underneath, so a choice is never made blind, and the wardrobe is one
 * tap away for changing a piece on its own.
 */
export const SetPicker: React.FC<SetPickerProps> = ({
  content,
  loadout,
  onSelect,
  onOpenWardrobe,
}) => {
  const worn = championOf(loadout, content.champions);
  const kit = kitOf(loadout, content);
  const spellNames = (kit?.bar ?? [])
    .map((id) => content.spells[id]?.name)
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[9.5px] uppercase tracking-label text-muted">
          Set
        </p>
        <button
          type="button"
          onClick={onOpenWardrobe}
          className="font-mono text-[9.5px] uppercase tracking-label text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
        >
          Wardrobe
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label="Set"
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(content.champions.length, 4)}, minmax(0, 1fr))` }}
      >
        {content.champions.map((champion) => {
          const set = kitOf(champion.set, content);
          if (!set) return null;
          const isSelected = champion.id === worn?.id;
          return (
            <button
              key={champion.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={`${champion.name}'s set`}
              onClick={() => onSelect(champion.set)}
              className={`relative flex flex-col items-center gap-0.5 border px-1 pb-1.5 pt-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                isSelected ? "border-ink bg-board" : "border-rule hover:border-graphite"
              }`}
            >
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5"
                style={{ backgroundColor: set.outfit.palette.primary }}
              />
              <span aria-hidden className="text-[18px] leading-none">
                {set.grimoire.symbol}
              </span>
              <span className="w-full truncate text-center font-display text-[11.5px] font-bold leading-tight tracking-tight sm:text-[12.5px]">
                {set.grimoire.name}
              </span>
            </button>
          );
        })}
      </div>

      {kit && (
        <div className="mt-2.5 text-[12.5px] leading-snug text-graphite">
          <p className="font-mono text-[9.5px] uppercase tracking-label text-ink">
            {kit.element} · {kit.grimoire.health} hp · {kit.grimoire.actionPoints} ap ·{" "}
            {kit.grimoire.movementPoints} mp
            {worn ? "" : " · your own set"}
          </p>
          <p className="mt-1 short:hidden">{kit.grimoire.lore}</p>
          <p className="mt-1 text-[11.5px] text-ink">
            <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
              Passive{" "}
            </span>
            {kit.grimoire.passive}
          </p>
          <p className="mt-1 text-[11.5px] text-ink">
            <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
              Rune{" "}
            </span>
            {kit.rune.name} — {kit.rune.description}
          </p>
          <p className="mt-1 truncate text-[11.5px] text-muted" title={spellNames}>
            {spellNames}
          </p>
        </div>
      )}
    </div>
  );
};
