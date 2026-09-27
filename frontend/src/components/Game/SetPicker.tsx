import React from "react";
import { ContentResponse, Loadout } from "../../types/message";
import { championOf, kitOf, shortName } from "../../utils/loadoutUtils";
import { elementLook } from "../../utils/elements";
import { ElementGlyph } from "./ElementGlyph";
import { OutfitIcon } from "./OutfitIcon";
import { RelicIcon } from "./RelicIcon";
import { runeKey } from "../../vfx/relics";

interface SetPickerProps {
  content: ContentResponse;
  loadout: Loadout;
  onSelect: (loadout: Loadout) => void;
  /** Opens the wardrobe, where each piece can be changed on its own. */
  onOpenWardrobe: () => void;
}

/**
 * The second choice on the landing page, after a name, and the only one that
 * changes how the fight plays. Four squares in a row: each is a champion, in
 * their outfit, over the element they fight in — the quickest way to be
 * dressed. What the character carries — its element and grimoire, its
 * numbers, its spells, its rune — reads underneath, so a choice is never made
 * blind, and the wardrobe is one tap away for changing a piece on its own.
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
          Champion
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
        aria-label="Champion"
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
              className={`relative flex flex-col items-center gap-0.5 border px-1 pb-1.5 pt-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                isSelected ? "border-ink bg-board" : "border-rule hover:border-graphite"
              }`}
            >
              <OutfitIcon sprite={set.outfit.sprite} size={30} framed={false} />
              <span className="w-full truncate text-center font-display text-[11.5px] font-bold leading-tight tracking-tight sm:text-[12.5px]">
                {shortName(champion.name)}
              </span>
              <span
                className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-label"
                style={{ color: elementLook(set.element)?.dark }}
              >
                <ElementGlyph element={set.element} size={10} />
                {set.element}
              </span>
            </button>
          );
        })}
      </div>

      {kit && (
        <div className="mt-2.5 text-[12.5px] leading-snug text-graphite">
          <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[9.5px] uppercase tracking-label text-ink">
            <ElementGlyph element={kit.element} size={11} />
            <span style={{ color: elementLook(kit.element)?.dark }}>{kit.element}</span> ·{" "}
            {kit.grimoire.name} · {kit.grimoire.health} hp · {kit.grimoire.actionPoints} ap ·{" "}
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
            {/* Its stone, at the fighters' own size: a pixel a 64th of a cell. */}
            <RelicIcon id={runeKey(kit.rune.id)} unit={1} className="-my-2 mr-0.5 inline-block align-middle" />
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
