import React, { useEffect, useRef, useState } from "react";
import { GameStatus, GAME_STATUS, Player } from "../../types/game";
import { GameState, Spell, SpellBook } from "../../types/message";
import { barSpells } from "../../utils/classUtils";
import { spellSummary, unavailableReason } from "../../utils/spellUtils";
import { FOLDED_COUNT, needsFolding, ringLayout, slotOffset } from "../../utils/spellArc";
import { effectTotal } from "../../utils/effectUtils";
import { SpellGlyph } from "./SpellGlyph";
import { RULES } from "../../utils/terrain";
import { BOARD } from "../../constants";

const ULTIMATE = "#c99a1a";
import { SpellCard } from "./SpellCard";
import { TurnClock } from "./TurnClock";

/*
 * The combat screen on a phone held sideways. The board takes the whole
 * screen and this is laid over its corners, where the diamond leaves room:
 * who plays top left, the way out top right, your fighter bottom left, and
 * everything a turn is spent on in an arc under the right thumb.
 */

const HAIRLINE = "border border-rule bg-panel/90 backdrop-blur-[2px]";
const PRESS = "transition-transform active:scale-95";

/* ------------------------------------------------------------------ */
/* Top left: the turn order and the clock.                             */
/* ------------------------------------------------------------------ */

export const TurnBar: React.FC<{
  gameState: GameState | null;
  userId: string;
  phase: string;
}> = ({ gameState, userId, phase }) => {
  const players = gameState?.players ?? {};
  const order = gameState?.turnOrder?.length
    ? gameState.turnOrder
    : Object.keys(players);
  const current = Object.values(players).find((p) => p.isCurrentTurn);

  return (
    <div className={`flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 ${HAIRLINE}`}>
      <div className="flex -space-x-1.5">
        {order.map((id) => {
          const p = players[id];
          if (!p) return null;
          return (
            <span
              key={id}
              title={p.character.name}
              className={`grid h-7 w-7 place-items-center rounded-full border-2 font-display text-[12px] font-bold text-white ${
                p.isCurrentTurn ? "border-vermilion" : "border-panel"
              } ${p.character.isAlive ? "" : "opacity-40"}`}
              style={{ backgroundColor: p.character.color }}
            >
              {p.character.name[0]?.toUpperCase()}
            </span>
          );
        })}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-label text-ink">
        {phase}
      </span>
      {current && (
        <TurnClock
          turnEndsAt={gameState?.turnEndsAt ?? 0}
          isMyTurn={current.userId === userId}
        />
      )}
    </div>
  );
};

export const CornerButton: React.FC<{
  label: string;
  onClick: () => void;
}> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-9 rounded-full px-3.5 font-mono text-[10px] uppercase tracking-label text-graphite ${HAIRLINE} ${PRESS}`}
  >
    {label}
  </button>
);

/* ------------------------------------------------------------------ */
/* Bottom left: your fighter.                                          */
/* ------------------------------------------------------------------ */

const Orb: React.FC<{ value: number; label: string; className: string }> = ({
  value,
  label,
  className,
}) => (
  <div className="flex flex-col items-center gap-0.5">
    <span
      className={`grid h-10 w-10 place-items-center rounded-full font-display text-[18px] font-bold tabular-nums text-white ${className}`}
    >
      {value}
    </span>
    <span className="font-mono text-[8.5px] uppercase tracking-label text-muted">
      {label}
    </span>
  </div>
);

export const FighterStatus: React.FC<{ player: Player | undefined }> = ({
  player,
}) => {
  const character = player?.character;
  if (!character) return null;
  const share = Math.max(
    0,
    Math.min(1, character.health / Math.max(1, character.maxHealth))
  );
  const shield = effectTotal(character.effects, "shield");

  return (
    <div className={`flex items-end gap-3 rounded-2xl px-3 py-2 ${HAIRLINE}`}>
      <div className="w-[118px]">
        <p className="truncate font-display text-[15px] font-bold leading-tight">
          {character.name}
        </p>
        <p className="mt-1 flex items-baseline gap-1 font-display text-[20px] font-bold leading-none tabular-nums text-vermilion">
          {character.health}
          <span className="font-mono text-[9px] font-normal uppercase tracking-label text-muted">
            hp{shield > 0 ? ` · ◈ ${shield}` : ""}
          </span>
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full bg-vermilion transition-[width] duration-300"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>
      <Orb value={character.actionPoints} label="ap" className="bg-pa" />
      <Orb value={character.movementPoints} label="mp" className="bg-pm" />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Bottom right: the spell arc.                                        */
/* ------------------------------------------------------------------ */

/** Where the arc's centre sits, measured in from the bottom-right corner. */
const CENTRE = { right: 64, bottom: 60 };
const MAIN_R = 44;
const SLOT = 46;
const LONG_PRESS_MS = 380;

const SpellButton: React.FC<{
  spell: Spell;
  blocked: string | null;
  cooldown: number;
  selected: boolean;
  onSelect: () => void;
  onPeek: (open: boolean) => void;
  style: React.CSSProperties;
  /** Folded away behind the main button. */
  hidden: boolean;
  /** An ultimate still waiting for its turn. */
  locked: boolean;
  /** An ultimate already cast this fight. */
  spent: boolean;
  /** Goes out through the player's relay, harder. */
  throughRelay: boolean;
}> = ({ spell, blocked, cooldown, selected, onSelect, onPeek, style, hidden, locked, spent, throughRelay }) => {
  const timer = useRef<number>();
  const peeked = useRef(false);

  const endPress = () => {
    window.clearTimeout(timer.current);
    if (peeked.current) onPeek(false);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      aria-label={`${spell.name}, ${spell.APCost} AP${blocked ? ` (${blocked})` : ""}. Hold for details.`}
      aria-pressed={selected}
      aria-disabled={!!blocked}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      onPointerDown={() => {
        peeked.current = false;
        timer.current = window.setTimeout(() => {
          peeked.current = true;
          onPeek(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // A long press only looked; it does not pick the spell.
        if (peeked.current) {
          peeked.current = false;
          return;
        }
        onSelect();
      }}
      // No backdrop behind the arc: each spell carries its own small shadow
      // so it reads against the board without hiding it.
      className={`absolute grid place-items-center rounded-full bg-board transition-[right,bottom,opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-90 [-webkit-touch-callout:none] ${
        selected
          ? "shadow-[0_0_0_3px_#d1462f,0_2px_8px_rgba(23,24,26,0.18)]"
          : spell.ultimate
            ? "shadow-[0_0_0_2px_#c99a1a,0_2px_8px_rgba(23,24,26,0.14)]"
            : throughRelay
              ? "shadow-[0_0_0_2px_#2e9e6a,0_2px_8px_rgba(23,24,26,0.14)]"
              : "shadow-[0_0_0_1px_#cfd0cd,0_2px_8px_rgba(23,24,26,0.14)]"
      } ${hidden ? "pointer-events-none scale-50 opacity-0" : blocked && !locked ? "opacity-40" : ""} ${
        spell.ultimate ? "!bg-[#fff6dc]" : ""
      }`}
      style={{ width: SLOT, height: SLOT, ...style }}
    >
      <span
        className={locked ? "opacity-40" : undefined}
        style={{ color: selected ? spell.color : spell.ultimate ? "#8a6a10" : undefined }}
      >
        <SpellGlyph spellId={spell.id} fallback={spell.icon} className="h-6 w-6" />
      </span>
      <span className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pa px-1 font-mono text-[10px] font-semibold text-white">
        {spell.APCost}
      </span>
      {cooldown > 0 && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-paper/85 font-mono text-[17px] font-semibold tabular-nums">
          {cooldown}
        </span>
      )}
      {locked && (
        <span
          className="absolute -left-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[9.5px] font-semibold text-white"
          style={{ backgroundColor: ULTIMATE }}
        >
          T{RULES.ultimateFromTurn}
        </span>
      )}
      {throughRelay && !locked && !spent && (
        <span
          className="absolute -left-1 -top-1 grid h-[18px] place-items-center rounded-full px-1 font-mono text-[9px] font-semibold text-white"
          style={{ backgroundColor: BOARD.relay }}
        >
          ↺
        </span>
      )}
      {spent && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-paper/80 font-mono text-[8.5px] uppercase tracking-label text-muted">
          used
        </span>
      )}
    </button>
  );
};

interface SpellArcProps {
  player: Player | undefined;
  spells: SpellBook | null;
  selectedSpellId: number | null;
  onSelectSpell: (spellId: number) => void;
  /** The one big action in the middle of the arc. */
  main: {
    label: string;
    disabled: boolean;
    onClick: () => void;
    beckon?: boolean;
  } | null;
  isMyTurn: boolean;
  turnEndsAt: number;
  /** The fight's turn, which is what unlocks an ultimate. */
  turnNumber: number;
  /** Whether the player has a relay out. */
  hasRelay?: boolean;
  status: GameStatus;
}

/** A ring around the main button that empties as the turn runs out. */
const TurnRing: React.FC<{ turnEndsAt: number }> = ({ turnEndsAt }) => {
  const [share, setShare] = useState(1);
  const total = useRef(1);
  useEffect(() => {
    if (!turnEndsAt) return;
    total.current = Math.max(1, turnEndsAt - Date.now());
    const tick = () =>
      setShare(Math.max(0, (turnEndsAt - Date.now()) / total.current));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [turnEndsAt]);
  const r = MAIN_R + 5;
  const c = 2 * Math.PI * r;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute"
      style={{ right: CENTRE.right - r - 3, bottom: CENTRE.bottom - r - 3 }}
      width={(r + 3) * 2}
      height={(r + 3) * 2}
    >
      <circle cx={r + 3} cy={r + 3} r={r} fill="none" stroke="#e2e3e0" strokeWidth={3} />
      <circle
        cx={r + 3}
        cy={r + 3}
        r={r}
        fill="none"
        stroke={share < 0.25 ? "#d1462f" : "#17181a"}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
        transform={`rotate(-90 ${r + 3} ${r + 3})`}
        style={{ transition: "stroke-dashoffset 250ms linear" }}
      />
    </svg>
  );
};

export const SpellArc: React.FC<SpellArcProps> = ({
  player,
  spells,
  selectedSpellId,
  onSelectSpell,
  main,
  isMyTurn,
  turnEndsAt,
  turnNumber,
  hasRelay = false,
  status,
}) => {
  const catalogue = barSpells(player, spells);
  const [peek, setPeek] = useState<Spell | null>(null);
  // The arc folds to a few spells while none is picked, so the board stays
  // clear for moving; picking one, or the "+" chip, fans the rest out.
  const [opened, setOpened] = useState(false);
  const hasSelection = selectedSpellId !== null;
  const wasSelected = useRef(hasSelection);
  useEffect(() => {
    // A cast (or a cancelled pick) folds it back.
    if (wasSelected.current && !hasSelection) setOpened(false);
    wasSelected.current = hasSelection;
  }, [hasSelection]);
  const extra = needsFolding(catalogue.length)
    ? catalogue.length - FOLDED_COUNT
    : 0;
  const folded = extra > 0 && !opened && !hasSelection;
  const layout = ringLayout(catalogue.length, folded);
  const actionPoints = player?.character?.actionPoints ?? 0;
  const selected = catalogue.find((s) => s.id === selectedSpellId);

  return (
    <div className="pointer-events-none absolute inset-0">
      {selected && (
        <div
          className={`absolute max-w-[300px] rounded-2xl px-3 py-1.5 text-right ${HAIRLINE}`}
          style={{ right: 16, bottom: CENTRE.bottom + 222 }}
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-ink">
            <b className="font-semibold">{selected.name}</b>
            <span
              className="ml-1.5"
              style={{ color: selected.ultimate ? "#8a6a10" : selected.color }}
            >
              {selected.role}
            </span>
            <span className="text-muted"> · pick a target</span>
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] tabular-nums text-graphite">
            {spellSummary(selected)}
          </p>
        </div>
      )}

      <div id="tutorial-spellbar" className="pointer-events-auto">
        {catalogue.map((spell, i) => {
          const { dx, dy } = slotOffset(layout[i]);
          const state = player?.spells?.[String(spell.id)];
          return (
            <SpellButton
              key={spell.id}
              spell={spell}
              blocked={unavailableReason(spell, state, actionPoints, turnNumber)}
              locked={spell.ultimate && !state?.spent && turnNumber < RULES.ultimateFromTurn}
              spent={spell.ultimate && !!state?.spent}
              throughRelay={spell.relayed && hasRelay}
              cooldown={state?.cooldownLeft ?? 0}
              selected={spell.id === selectedSpellId}
              onSelect={() => onSelectSpell(spell.id)}
              onPeek={(open) => setPeek(open ? spell : null)}
              hidden={!layout[i].shown}
              style={{
                right: CENTRE.right - dx - SLOT / 2,
                bottom: CENTRE.bottom - dy - SLOT / 2,
              }}
            />
          );
        })}
      </div>

      {extra > 0 && !hasSelection && (
        <button
          type="button"
          onClick={() => setOpened((o) => !o)}
          aria-expanded={!folded}
          aria-label={folded ? `Show ${extra} more spells` : "Fold the spells"}
          className={`pointer-events-auto absolute grid h-8 min-w-8 place-items-center rounded-full px-2.5 font-mono text-[11px] font-semibold text-graphite transition-[right,bottom] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-95 ${HAIRLINE} shadow-[0_2px_8px_rgba(23,24,26,0.12)]`}
          style={
            folded
              ? // Just past the folded fan, up and to the left.
                { right: CENTRE.right + 104, bottom: CENTRE.bottom + 78 }
              : // Beyond the open arc's left end.
                { right: CENTRE.right + 196, bottom: CENTRE.bottom - 16 }
          }
        >
          {folded ? `+${extra}` : "−"}
        </button>
      )}

      {status === GAME_STATUS.PLAYING && isMyTurn && (
        <TurnRing turnEndsAt={turnEndsAt} />
      )}

      <div
        id="tutorial-mainbutton"
        className="pointer-events-auto absolute"
        style={{
          right: CENTRE.right - MAIN_R,
          bottom: CENTRE.bottom - MAIN_R,
        }}
      >
        {main ? (
          <button
            type="button"
            onClick={main.onClick}
            disabled={main.disabled}
            className={`grid place-items-center rounded-full bg-vermilion px-2 text-center font-display text-[15px] font-extrabold leading-tight text-white transition-transform active:scale-95 disabled:bg-hairline disabled:text-muted ${
              main.beckon ? "animate-beckon" : ""
            }`}
            style={{ width: MAIN_R * 2, height: MAIN_R * 2 }}
          >
            {main.label}
          </button>
        ) : null}
      </div>

      {peek && (
        <SpellCard
          spell={peek}
          blocked={unavailableReason(
            peek,
            player?.spells?.[String(peek.id)],
            actionPoints,
            turnNumber
          )}
        />
      )}
    </div>
  );
};
