import React from "react";
import { Player } from "../../types/game";
import { Spell, SpellBook, SpellState } from "../../types/message";
import { SpellGlyph } from "./SpellGlyph";

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
  selectedSpellId: number | null;
  currentPlayer: Player | undefined;
  /** The catalogue broadcast by the server; the client keeps no copy. */
  spells: SpellBook | null;
}

const shapes: Record<Spell["areaOfEffect"], string | null> = {
  none: null,
  circle: "circle",
  cross: "cross",
  line: "line",
};

/** The one line that says what the selected spell actually does. */
const spec = (spell: Spell): string => {
  const parts = [`${spell.APCost} AP`];
  parts.push(spell.range === 0 ? "on yourself" : `range ${spell.range}`);
  const shape = shapes[spell.areaOfEffect];
  if (shape) parts.push(shape);
  if (spell.cooldown > 0) {
    parts.push(`${spell.cooldown} turn cooldown`);
  } else if (spell.maxCastsPerTurn > 0) {
    parts.push(
      spell.maxCastsPerTurn === 1
        ? "once a turn"
        : `${spell.maxCastsPerTurn}× a turn`
    );
  }
  return parts.join(" · ");
};

/** Why a spell cannot be cast right now, or null when it can. */
const unavailableReason = (
  spell: Spell,
  state: SpellState | undefined,
  actionPoints: number
): string | null => {
  if (state && state.cooldownLeft > 0) {
    return `recharging — ${state.cooldownLeft} turn${
      state.cooldownLeft > 1 ? "s" : ""
    } left`;
  }
  if (
    spell.maxCastsPerTurn > 0 &&
    state &&
    state.castsThisTurn >= spell.maxCastsPerTurn
  ) {
    return "no casts left this turn";
  }
  if (actionPoints < spell.APCost) return "not enough action points";
  return null;
};

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

  return (
    <button
      type="button"
      className={`relative h-16 w-16 flex-none bg-board text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion ${
        isSelected
          ? "border-2 border-ink"
          : "border border-rule hover:border-graphite"
      } ${blocked ? "opacity-35" : ""}`}
      title={`${spell.name} — ${spec(spell)} — press ${shortcut}${
        blocked ? ` (${blocked})` : ""
      }`}
      aria-pressed={isSelected}
      aria-disabled={!!blocked}
      onClick={() => onSelect(spell.id)}
    >
      <span className="absolute left-1.5 top-0.5 font-mono text-[9px] text-muted">
        {shortcut}
      </span>
      {/* The element is a 6px square, the only place a spell's own colour shows. */}
      <span
        aria-hidden
        className="absolute right-1.5 top-1.5 h-1.5 w-1.5"
        style={{ backgroundColor: spell.color }}
      />
      <span className="flex h-full items-center justify-center">
        <SpellGlyph spellId={spell.id} fallback={spell.icon} />
      </span>
      <span className="absolute bottom-0.5 right-1.5 font-mono text-[10px] tabular-nums text-muted">
        {spell.APCost}
      </span>
      {cooldown > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-paper/80 font-mono text-[18px] font-semibold tabular-nums">
          {cooldown}
        </span>
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
  const catalogue = React.useMemo(
    () => Object.values(spells ?? {}).sort((a, b) => a.id - b.id),
    [spells]
  );

  const actionPoints = currentPlayer?.character?.actionPoints ?? 0;
  const selected = catalogue.find((spell) => spell.id === selectedSpellId);

  return (
    <div className="flex h-full flex-col">
      <div className="font-mono text-[9.5px] uppercase tracking-label text-muted">
        Spells{" "}
        <span className="text-rule">
          1 – {Math.min(catalogue.length, 9)}
        </span>
      </div>

      <div className="mb-2.5 mt-1.5 truncate font-display text-[21px] font-bold leading-none">
        {selected ? (
          <>
            {selected.name}
            <span className="ml-2.5 font-sans text-xs font-normal text-muted">
              {spec(selected)}
            </span>
          </>
        ) : (
          <span className="font-sans text-xs font-normal text-muted">
            Pick a spell with a number key, or click a cell to walk there.
          </span>
        )}
      </div>

      <div className="mt-auto flex gap-[7px] overflow-x-auto">
        {catalogue.map((spell, index) => (
          <SpellSlot
            key={spell.id}
            spell={spell}
            // The number key that selects this slot, in catalogue order.
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
