import React from "react";
import { Player } from "../../types/game";
import { Spell, SpellBook, SpellState } from "../../types/message";
import { SpellGlyph } from "./SpellGlyph";
import { SpellTooltip } from "./SpellTooltip";
import { barSpells } from "../../utils/classUtils";
import { RULES } from "../../utils/terrain";
import { BOARD } from "../../constants";
import { spec, spellSummary, unavailableReason } from "../../utils/spellUtils";

/** The ultimate's own colour: gold, the one thing on the bar that is rare. */
const ULTIMATE = "#c99a1a";

interface SpellBarProps {
  handleSpellClick: (spellId: number) => void;
  selectedSpellId: number | null;
  currentPlayer: Player | undefined;
  /** The catalogue broadcast by the server; the client keeps no copy. */
  spells: SpellBook | null;
  /** The fight's turn, which is what unlocks an ultimate. */
  turnNumber?: number;
  /** Whether this player has a relay out, which changes how air spells go. */
  hasRelay?: boolean;
  /** A spell's own card was opened — the tutorial counts these. */
  onPeek?: () => void;
}

const SpellSlot: React.FC<{
  spell: Spell;
  shortcut: number;
  state: SpellState | undefined;
  actionPoints: number;
  turnNumber: number;
  hasRelay: boolean;
  isSelected: boolean;
  onSelect: (spellId: number) => void;
  onPeek?: () => void;
}> = ({ spell, shortcut, state, actionPoints, turnNumber, hasRelay, isSelected, onSelect, onPeek }) => {
  const throughRelay = spell.relayed && hasRelay;
  const blocked = unavailableReason(spell, state, actionPoints, turnNumber);
  const spent = spell.ultimate && !!state?.spent;
  const locked = spell.ultimate && !spent && turnNumber < RULES.ultimateFromTurn;
  const cooldown = state?.cooldownLeft ?? 0;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = React.useState(false);
  const peek = (open: boolean) => {
    setShowTooltip(open);
    if (open) onPeek?.();
  };

  return (
    <div className="flex flex-none flex-col items-center lg:min-w-0 lg:max-w-[190px] lg:flex-1 short:!max-w-none">
    <button
      ref={buttonRef}
      type="button"
      className={`relative h-12 w-12 flex-none text-ink transition-colors narrow:h-12 narrow:w-full sm:h-14 sm:w-14 lg:h-[72px] lg:w-full short:h-11 short:w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion ${
        spell.ultimate ? "bg-[#fff6dc]" : "bg-board"
      } ${
        isSelected
          ? "border-2 border-ink"
          : spell.ultimate
            ? "border-2 hover:border-graphite"
            : "border border-rule hover:border-graphite"
      } ${blocked && !locked ? "opacity-35" : ""}`}
      style={
        spell.ultimate && !isSelected
          ? { borderColor: ULTIMATE }
          : throughRelay && !isSelected
            ? { borderColor: BOARD.relay, boxShadow: `inset 0 0 0 1px ${BOARD.relay}` }
            : undefined
      }
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
      onPointerEnter={(e) => e.pointerType === "mouse" && peek(true)}
      onPointerLeave={() => peek(false)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && peek(true)}
      onBlur={() => peek(false)}
    >
      <span className="absolute left-1.5 top-0.5 font-mono text-[9px] text-muted touch:hidden">
        {shortcut}
      </span>
      {/* The element is a 6px square, the only place a spell's own colour shows. */}
      {!throughRelay && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5"
          style={{ backgroundColor: spell.color }}
        />
      )}
      <span
        className={`flex h-full items-center justify-center lg:justify-start lg:pl-3 lg:pr-5 short:!justify-center short:!px-0 ${locked ? "opacity-40" : ""}`}
        style={spell.ultimate ? { color: "#8a6a10" } : undefined}
      >
        <SpellGlyph
          spellId={spell.id}
          fallback={spell.icon}
          className="h-6 w-6 sm:h-7 sm:w-7"
        />
        {/* On a desk there is room to say what the spell is and does. */}
        <span className="ml-2.5 hidden min-w-0 flex-1 text-left lg:block short:!hidden">
          <span className="block truncate font-display text-[13px] font-bold leading-tight text-ink">
            {spell.name}
          </span>
          <span
            className="block truncate font-mono text-[9px] uppercase tracking-label"
            style={{ color: spell.ultimate ? "#8a6a10" : spell.color }}
          >
            {spell.role}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] tabular-nums text-graphite">
            {spellSummary(spell)}
          </span>
        </span>
      </span>
      <span className="absolute bottom-0.5 right-1.5 font-mono text-[10px] tabular-nums text-muted">
        {spell.APCost}
      </span>
      {throughRelay && (
        // The relay is out: this spell will go through it, harder.
        <span
          className="absolute inset-x-1 top-0.5 text-right font-mono text-[9px] font-semibold leading-none"
          style={{ color: BOARD.relay }}
          title={`Goes through your relay: +${RULES.relayBonus}% damage`}
        >
          ↺+{RULES.relayBonus}%
        </span>
      )}
      {cooldown > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-paper/80 font-mono text-[18px] font-semibold tabular-nums">
          {cooldown}
        </span>
      )}
      {locked && (
        // Still to come, not broken: the glyph stays, the corner says when.
        <span
          className="absolute bottom-0.5 left-1.5 font-mono text-[10px] font-semibold tabular-nums"
          style={{ color: ULTIMATE }}
        >
          T{RULES.ultimateFromTurn}
        </span>
      )}
      {spent && (
        <span className="absolute inset-0 grid place-items-center bg-paper/70 font-mono text-[10px] uppercase tracking-label text-muted">
          used
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
      {/* What the spell is for, in one word, under every slot. */}
      <span
        className="mt-0.5 hidden max-w-[64px] truncate font-mono text-[9px] uppercase tracking-label short:hidden sm:block lg:!hidden"
        style={{ color: spell.ultimate ? ULTIMATE : undefined }}
      >
        {spell.role}
      </span>
    </div>
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
  turnNumber = 0,
  hasRelay = false,
  onPeek,
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
            {/* The whole sentence, where there is room for it. */}
            <span className="ml-2.5 hidden font-sans text-xs font-normal text-graphite xl:inline short:!hidden">
              — {selected.description}
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
      <div className="-mx-1 mt-auto flex gap-[6px] overflow-x-auto px-1 pb-0.5 lg:overflow-visible narrow:grid narrow:grid-cols-5 narrow:overflow-visible sm:gap-[7px] short:mt-0 short:grid short:grid-cols-5 short:gap-1.5 short:overflow-visible">
        {catalogue.map((spell, index) => (
          <SpellSlot
            key={spell.id}
            spell={spell}
            // The number key that selects this slot, in bar order.
            shortcut={index + 1}
            state={currentPlayer?.spells?.[String(spell.id)]}
            actionPoints={actionPoints}
            turnNumber={turnNumber}
            hasRelay={hasRelay}
            isSelected={selectedSpellId === spell.id}
            onSelect={handleSpellClick}
            onPeek={onPeek}
          />
        ))}
      </div>
    </div>
  );
};

export default SpellBar;
