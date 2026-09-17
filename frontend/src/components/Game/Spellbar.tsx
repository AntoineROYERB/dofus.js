import React from "react";
import { Player } from "../../types/game";
import { Spell, SpellBook, SpellState } from "../../types/message";
import { SpellGlyph } from "./SpellGlyph";
import { SpellTooltip } from "./SpellTooltip";
import { barSpells } from "../../utils/classUtils";
import { spec, unavailableReason } from "../../utils/spellUtils";

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
  selectedSpellId: number | null;
  currentPlayer: Player | undefined;
  /** The catalogue broadcast by the server; the client keeps no copy. */
  spells: SpellBook | null;
}

const SpellSlot: React.FC<{
  spell: Spell;
  shortcut: number;
  state: SpellState | undefined;
  actionPoints: number;
  isSelected: boolean;
  onSelect: (spellId: number) => void;
}> = ({ spell, shortcut, state, actionPoints, isSelected, onSelect }) => {
  const blocked = unavailableReason(spell, state, actionPoints);
  const cooldown = state?.cooldownLeft ?? 0;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`relative h-12 w-12 flex-none bg-board text-ink transition-colors narrow:h-12 narrow:w-full sm:h-14 sm:w-14 lg:h-16 lg:w-16 short:h-11 short:w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion ${
        isSelected
          ? "border-2 border-ink"
          : "border border-rule hover:border-graphite"
      } ${blocked ? "opacity-35" : ""}`}
      aria-label={`${spell.name} — ${spec(spell)} — press ${shortcut}${
        blocked ? ` (${blocked})` : ""
      }`}
      aria-pressed={isSelected}
      aria-disabled={!!blocked}
      onClick={() => onSelect(spell.id)}
      // A tap fires hover and focus too, and on a phone the card would then sit
      // over the bar until something else took focus. The heading above the
      // slots already says what the tapped spell does, so only a mouse or a
      // keyboard gets the card.
      onPointerEnter={(e) => e.pointerType === "mouse" && setShowTooltip(true)}
      onPointerLeave={() => setShowTooltip(false)}
      onFocus={(e) =>
        e.currentTarget.matches(":focus-visible") && setShowTooltip(true)
      }
      onBlur={() => setShowTooltip(false)}
    >
      <span className="absolute left-1.5 top-0.5 font-mono text-[9px] text-muted touch:hidden">
        {shortcut}
      </span>
      {/* The element is a 6px square, the only place a spell's own colour shows. */}
      <span
        aria-hidden
        className="absolute right-1.5 top-1.5 h-1.5 w-1.5"
        style={{ backgroundColor: spell.color }}
      />
      <span className="flex h-full items-center justify-center">
        <SpellGlyph
          spellId={spell.id}
          fallback={spell.icon}
          className="h-6 w-6 sm:h-7 sm:w-7"
        />
      </span>
      <span className="absolute bottom-0.5 right-1.5 font-mono text-[10px] tabular-nums text-muted">
        {spell.APCost}
      </span>
      {cooldown > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-paper/80 font-mono text-[18px] font-semibold tabular-nums">
          {cooldown}
        </span>
      )}
      {showTooltip && buttonRef.current && (
        <SpellTooltip
          spell={spell}
          blocked={blocked}
          anchorRect={buttonRef.current.getBoundingClientRect()}
        />
      )}
    </button>
  );
};

/**
 * The spells zone of the bar. The selected spell is announced as a heading
 * rather than hidden in a tooltip: on the old bar the only way to know what
 * ☄️ cost was to hover it and wait.
 */
const SpellBar: React.FC<SpellBarProps> = ({
  handleSpellClick,
  selectedSpellId,
  currentPlayer,
  spells,
}) => {
  // The player's own bar, in its own order: the catalogue carries every
  // class's spells, and a class may carry fewer than there are slots.
  const catalogue = React.useMemo(
    () => barSpells(currentPlayer, spells),
    [currentPlayer, spells]
  );

  const actionPoints = currentPlayer?.character?.actionPoints ?? 0;
  const selected = catalogue.find((spell) => spell.id === selectedSpellId);

  return (
    <div className="flex h-full flex-col">
      <div className="font-mono text-[9.5px] uppercase tracking-label text-muted short:hidden">
        Spells{" "}
        <span className="text-rule touch:hidden">
          1 – {Math.min(catalogue.length, 9)}
        </span>
      </div>

      <div className="mb-1.5 mt-1 truncate font-display text-[16px] font-bold leading-none sm:mb-2.5 sm:mt-1.5 sm:text-[21px] short:mb-1.5 short:mt-0 short:text-[15px]">
        {selected ? (
          <>
            {selected.name}
            <span className="ml-2.5 hidden font-sans text-xs font-normal text-muted sm:inline short:mt-1 short:block short:ml-0 short:truncate short:text-[11px]">
              {spec(selected)}
            </span>
          </>
        ) : (
          <span className="font-sans text-[11.5px] font-normal text-muted sm:text-xs short:text-[11px]">
            <span className="hidden touch:inline">
              Tap a cell to preview, again to go.
            </span>
            <span className="touch:hidden">
              Pick a spell with a number key, or click a cell to walk there.
            </span>
          </span>
        )}
      </div>

      {/*
        A row on a desk, a 4×2 block on a phone — held upright under the
        board, or sideways in the right-hand column. Eight spells in a
        scrolling strip meant most of them were off screen.
      */}
      <div className="-mx-1 mt-auto flex gap-[6px] overflow-x-auto px-1 pb-0.5 narrow:grid narrow:grid-cols-4 narrow:overflow-visible sm:gap-[7px] short:mt-0 short:grid short:grid-cols-4 short:gap-1.5 short:overflow-visible">
        {catalogue.map((spell, index) => (
          <SpellSlot
            key={spell.id}
            spell={spell}
            // The number key that selects this slot, in bar order.
            shortcut={index + 1}
            state={currentPlayer?.spells?.[String(spell.id)]}
            actionPoints={actionPoints}
            isSelected={selectedSpellId === spell.id}
            onSelect={handleSpellClick}
          />
        ))}
      </div>
    </div>
  );
};

export default SpellBar;
