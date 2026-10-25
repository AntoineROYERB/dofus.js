import React, { useEffect, useRef, useState } from "react";
import { Player } from "../../types/game";
import { GameState, Spell, SpellBook } from "../../types/message";
import { barSpells } from "../../utils/loadoutUtils";
import { spellSummary, unavailableReason } from "../../utils/spellUtils";
import { SpellUpgrade, upgradesOf } from "../../utils/spellUpgrades";
import { effectTotal } from "../../utils/effectUtils";
import { SpellGlyph } from "./SpellGlyph";
import { RULES } from "../../utils/terrain";
import { BOARD } from "../../constants";
import { SpellCard } from "./SpellCard";
import { hapticHurry } from "../../lib/native";
import { sameSide } from "../../utils/sides";
import { TurnClock } from "./TurnClock";

/*
 * The combat screen on a phone held sideways. The board takes the whole
 * screen and this is laid over its corners, where the diamond leaves room:
 * who plays top left, the way out top right, the spells as a command deck
 * down the left edge, and your fighter — health and points curved round its
 * portrait — bottom right, beside the button that ends the turn.
 */

const HAIRLINE = "border border-gold/40 bg-panel/90 backdrop-blur-[2px]";

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
              className={`grid h-7 w-7 place-items-center rounded-full border-2 font-display text-[13px] font-bold text-night ${
                p.isCurrentTurn ? "border-ink" : "border-panel"
              } ${p.character.isAlive ? "" : "opacity-40"}`}
              style={{ backgroundColor: sameSide(players, id, userId) ? BOARD.socle.mine : BOARD.socle.theirs }}
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

/**
 * The one way into everything a fight keeps off the board — the log, the
 * chat, the doors out. It used to be two words side by side, Log and Leave,
 * and the second was a forfeit one slip away from the first.
 */
export const MenuButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Menu: log, chat and leave"
    className="btn-night flex h-10 items-center gap-2 pl-3 pr-4 font-mono text-[10px] uppercase tracking-label"
  >
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
    Menu
  </button>
);


/* ------------------------------------------------------------------ */
/* Bottom right: your fighter, its gauges curved round its portrait.   */
/* ------------------------------------------------------------------ */

/** One gauge: a three-quarter ring that empties clockwise from the bottom. */
const Arc: React.FC<{
  r: number;
  share: number;
  colour: string;
  width: number;
}> = ({ r, share, colour, width }) => {
  const length = 2 * Math.PI * r * 0.75;
  const full = 2 * Math.PI * r;
  return (
    <>
      <circle
        cx={56}
        cy={56}
        r={r}
        fill="none"
        className="stroke-night"
        strokeWidth={width + 2}
        strokeDasharray={`${length} ${full}`}
        strokeLinecap="round"
        transform="rotate(90 56 56)"
      />
      <circle
        cx={56}
        cy={56}
        r={r}
        fill="none"
        // A style, not an attribute: WebKit does not resolve a CSS variable
        // in an SVG presentation attribute.
        style={{ stroke: colour, transition: "stroke-dasharray 300ms ease-out" }}
        strokeWidth={width}
        strokeDasharray={`${length * Math.max(0, Math.min(1, share))} ${full}`}
        strokeLinecap="round"
        transform="rotate(90 56 56)"
      />
    </>
  );
};

/**
 * Health is the outer ring, in a vivid red; action points the inner one,
 * in their blue. Read the way an action RPG is read: the number that matters
 * in the middle, and how much of it is left as how much ring is left. The
 * points themselves sit on the ring as two badges, blue for action and green
 * for movement, the colours they have on the board.
 */
export const PortraitGauge: React.FC<{ player: Player | undefined }> = ({
  player,
}) => {
  const character = player?.character;
  if (!character) return null;
  const shield = effectTotal(character.effects, "shield");
  const health = character.health / Math.max(1, character.maxHealth);
  const points =
    character.actionPoints / Math.max(1, character.maxActionPoints || character.actionPoints);

  // Small enough to sit beside the gold disc without covering the board's
  // corner: no name (it is yours), the points as two badges on the ring.
  return (
    <div
      className="relative h-[88px] w-[88px] flex-none"
      aria-label={`${character.health} of ${character.maxHealth} HP, ${character.actionPoints} AP, ${character.movementPoints} MP${shield > 0 ? `, ${shield} shield` : ""}`}
      role="img"
    >
      <svg aria-hidden viewBox="0 0 112 112" className="absolute inset-0 h-full w-full drop-shadow-[0_4px_10px_rgb(var(--night)/0.7)]">
        <Arc r={50} share={health} colour="rgb(var(--hp))" width={8} />
        <Arc r={38} share={points} colour="rgb(var(--pa))" width={5} />
        <circle cx={56} cy={56} r={29} className="fill-panel stroke-gold" strokeWidth={2.5} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="text-center leading-none">
          <span className="block font-display text-[21px] font-bold tabular-nums">
            {character.health}
          </span>
          <span className="font-mono text-[8px] uppercase tracking-label text-hp">
            {shield > 0 ? `+${shield} ◈` : "hp"}
          </span>
        </span>
      </span>
      <span className="absolute -left-1 top-0 grid h-[26px] min-w-[26px] place-items-center rounded-full bg-pa px-1 font-display text-[14px] font-bold tabular-nums text-night shadow-[0_0_0_2px_rgb(var(--paper))]">
        {character.actionPoints}
        <span className="sr-only"> AP</span>
      </span>
      <span className="absolute -left-1 bottom-0 grid h-[26px] min-w-[26px] place-items-center rounded-full bg-pm px-1 font-display text-[14px] font-bold tabular-nums text-night shadow-[0_0_0_2px_rgb(var(--paper))]">
        {character.movementPoints}
        <span className="sr-only"> MP</span>
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Bottom left: the command deck.                                      */
/* ------------------------------------------------------------------ */

const LONG_PRESS_MS = 380;

/**
 * One spell of the deck. A tap picks it; a long press only reads it, the
 * way the old arc did, so a finger can check a spell without casting it.
 */
const Command: React.FC<{
  spell: Spell;
  blocked: string | null;
  cooldown: number;
  selected: boolean;
  locked: boolean;
  spent: boolean;
  throughRelay: boolean;
  upgrades: SpellUpgrade[];
  /** The number key that picks it, shown where there is a keyboard. */
  shortcut?: number;
  /** Whether it is this player's turn: out of it, the row is greyed. */
  active: boolean;
  /** How long after the turn comes round this row lights up, in ms. */
  wakeDelay: number;
  onSelect: () => void;
  onPeek: (open: boolean) => void;
}> = ({ spell, blocked, cooldown, selected, locked, spent, throughRelay, upgrades, shortcut, active, wakeDelay, onSelect, onPeek }) => {
  const timer = useRef<number>();
  const peeked = useRef(false);
  const endPress = () => {
    window.clearTimeout(timer.current);
    if (peeked.current) onPeek(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const upgraded = upgrades.length > 0;
  // What the right end of the row says: why it cannot go, or what it costs.
  const tag = spent
    ? "used"
    : locked
      ? `turn ${RULES.ultimateFromTurn}`
      : cooldown > 0
        ? `⟳ ${cooldown}`
        : `${spell.APCost} ap`;

  return (
    <button
      type="button"
      aria-label={`${spell.name}, ${spell.APCost} AP${upgraded ? `, upgraded: ${upgrades.map((u) => u.label).join(", ")}` : ""}${blocked ? ` (${blocked})` : ""}. Hold for details.`}
      aria-pressed={selected}
      aria-disabled={!!blocked}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        peeked.current = false;
        timer.current = window.setTimeout(() => {
          peeked.current = true;
          onPeek(true);
        }, LONG_PRESS_MS);
      }}
      // A mouse reads a spell by resting on it, as the desk's bar always did.
      onPointerEnter={(e) => e.pointerType === "mouse" && onPeek(true)}
      onPointerUp={endPress}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onPeek(false);
        else endPress();
      }}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (peeked.current) {
          peeked.current = false;
          return;
        }
        // Out of turn a row can still be read (held, or hovered), not picked.
        if (!active) return;
        onSelect();
      }}
      className={`relative flex w-full items-center gap-2 rounded-r-full pl-3 pr-3 text-left transition-[transform,background-color,opacity] duration-200 ease-out active:scale-[0.98] [-webkit-touch-callout:none] ${
        upgraded ? "min-h-[44px] py-1" : "h-[38px]"
      } ${!active ? "opacity-50 grayscale" : "motion-safe:animate-wake"} ${
        selected
          ? "translate-x-3 bg-gradient-to-r from-[#fff2b8] to-gold text-[#2a1b00] shadow-[0_0_16px_rgb(var(--gold)/0.5)]"
          : "bg-panel/90 text-ink backdrop-blur-[2px]"
      } ${blocked && !locked && !selected ? "opacity-45" : ""}`}
      style={{
        animationDelay: active ? `${wakeDelay}ms` : undefined,
        // The left edge is the deck's spine: gold for a spell as dealt, the
        // heart's pink for one a dream has made stronger, and the page's own
        // rule while the turn is someone else's.
        boxShadow: selected
          ? undefined
          : !active
            ? "inset 3px 0 0 rgb(var(--rule))"
            : upgraded
            ? "inset 4px 0 0 rgb(var(--heart)), inset 0 0 0 1.5px rgb(var(--heart) / 0.75), 0 0 12px rgb(var(--heart) / 0.35)"
            : "inset 3px 0 0 rgb(var(--gold))",
      }}
    >
      {selected && (
        <span aria-hidden className="absolute -left-3 text-[13px] text-hp drop-shadow">
          ♥
        </span>
      )}
      {shortcut !== undefined && (
        <span
          aria-hidden
          className={`w-2.5 flex-none font-mono text-[9px] tabular-nums touch:hidden ${selected ? "text-[#2a1b00]/60" : "text-muted"}`}
        >
          {shortcut}
        </span>
      )}
      <span
        className={`flex-none ${locked ? "opacity-40" : ""}`}
        style={{ color: selected ? "#2a1b00" : spell.ultimate ? "rgb(var(--gold))" : spell.color }}
      >
        <SpellGlyph spellId={spell.baseId ?? spell.id} fallback={spell.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-display text-[14px] font-bold leading-tight ${
            spell.ultimate && !selected ? "text-gold" : ""
          }`}
        >
          {upgraded && (
            <span aria-hidden className={selected ? "mr-1" : "mr-1 text-heart"}>
              ✦
            </span>
          )}
          {spell.name}
        </span>
        {upgraded && (
          <span
            className={`block truncate font-mono text-[9px] uppercase tracking-label ${
              selected ? "text-[#2a1b00]/75" : "text-heart"
            }`}
          >
            {upgrades.map((u) => u.label).join(" · ")}
          </span>
        )}
      </span>
      {throughRelay && !locked && !spent && (
        <span
          className="flex-none font-mono text-[10px]"
          style={{ color: BOARD.relay }}
          title={`Goes through your relay: +${RULES.relayBonus}% damage`}
        >
          ↺
        </span>
      )}
      <span
        className={`flex-none font-mono text-[10px] uppercase tracking-label tabular-nums ${
          selected
            ? "text-[#2a1b00]"
            : cooldown > 0 || locked || spent
              ? "text-muted"
              : upgrades.some((u) => u.kind === "cost")
                ? "text-heart"
                : "text-pa"
        }`}
      >
        {tag}
      </span>
    </button>
  );
};

interface CommandDeckProps {
  player: Player | undefined;
  spells: SpellBook | null;
  selectedSpellId: number | null;
  onSelectSpell: (spellId: number) => void;
  /** The fight's turn, which is what unlocks an ultimate. */
  turnNumber: number;
  /** Whether the player has a relay out. */
  hasRelay?: boolean;
  /** A spell was held long enough to read it — the tutorial counts these. */
  onPeek?: () => void;
  /** Number each spell with the key that picks it (a desk, not a phone). */
  shortcuts?: boolean;
  /** Opens the list of keyboard shortcuts, where there is a keyboard. */
  onHelp?: () => void;
  /**
   * Whether it is this player's turn. Out of it the deck greys out, and as
   * the turn comes round it lights up again, row after row: the deck is
   * what says "your turn", where the thumb already is, instead of a banner
   * laid over the board.
   */
  active?: boolean;
  /** Changes with every turn, so the deck lights up again each time. */
  turnKey?: string | number;
}

/**
 * The spells, as a command list down the left edge. The arc it replaces
 * showed icons only, so what a spell was called and what it cost had to be
 * held open to be read; here every spell says both, and a spell a dream has
 * made stronger is framed in pink with what changed written under its name.
 */
export const CommandDeck: React.FC<CommandDeckProps> = ({
  player,
  spells,
  selectedSpellId,
  onSelectSpell,
  turnNumber,
  hasRelay = false,
  onPeek,
  shortcuts = false,
  onHelp,
  active = true,
  turnKey = 0,
}) => {
  const catalogue = barSpells(player, spells);
  const [peek, setPeek] = useState<Spell | null>(null);
  const actionPoints = player?.character?.actionPoints ?? 0;
  // A card that missed its pointerleave — the mouse leaving faster than the
  // browser reports it — must still go: any press anywhere closes it.
  useEffect(() => {
    if (!peek) return;
    const close = () => setPeek(null);
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [peek]);

  return (
    <div className={`flex flex-col items-start ${shortcuts ? "w-[244px]" : "w-[216px]"}`}>
      <div className="ml-3 flex items-end gap-2">
        <span
          className={`rounded-t-lg px-3 py-0.5 font-mono text-[9.5px] uppercase tracking-label transition-colors duration-300 ${
            active ? "bg-gold text-[#2a1b00]" : "bg-hairline text-muted"
          }`}
        >
          {active ? "Your spells" : "Waiting"}
        </span>
        {shortcuts && onHelp && (
          <button
            type="button"
            onClick={onHelp}
            className="mb-0.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-gold touch:hidden"
          >
            <Keycap>H</Keycap> Keys
          </button>
        )}
      </div>
      {/*
        Scrolls rather than grows: a dream can deal a spell more than the five
        a set carries, and the deck must never reach the turn bar.
      */}
      <div className="flex max-h-[calc(100dvh-112px)] w-full flex-col gap-1 overflow-y-auto overflow-x-visible pr-4">
        {catalogue.map((spell, index) => {
          const state = player?.spells?.[String(spell.id)];
          return (
            <Command
              // Keyed by the turn as well, so each new turn plays the wake.
              key={`${spell.id}-${active ? turnKey : "idle"}`}
              active={active}
              wakeDelay={index * 45}
              spell={spell}
              blocked={unavailableReason(spell, state, actionPoints, turnNumber, hasRelay)}
              locked={spell.ultimate && !state?.spent && turnNumber < RULES.ultimateFromTurn}
              spent={spell.ultimate && !!state?.spent}
              throughRelay={spell.relayed && hasRelay}
              cooldown={state?.cooldownLeft ?? 0}
              selected={spell.id === selectedSpellId}
              upgrades={upgradesOf(spell, spells)}
              shortcut={shortcuts && index < 9 ? index + 1 : undefined}
              onSelect={() => onSelectSpell(spell.id)}
              onPeek={(open) => {
                setPeek(open ? spell : null);
                if (open) onPeek?.();
              }}
            />
          );
        })}
      </div>
      {peek && (
        <SpellCard
          spell={peek}
          upgrades={upgradesOf(peek, spells)}
          blocked={unavailableReason(
            peek,
            player?.spells?.[String(peek.id)],
            actionPoints,
            turnNumber,
            hasRelay
          )}
        />
      )}
    </div>
  );
};

/**
 * The picked spell, spelled out, under the menu button: what it does, and a
 * × to put it back down, since a finger has no Escape key.
 */
export const SpellHint: React.FC<{
  player: Player | undefined;
  spells: SpellBook | null;
  selectedSpellId: number | null;
  onSelectSpell: (spellId: number) => void;
}> = ({ player, spells, selectedSpellId, onSelectSpell }) => {
  const selected = barSpells(player, spells).find((s) => s.id === selectedSpellId);
  if (!selected) return null;
  return (
    <div className={`flex max-w-[min(320px,50vw)] items-center gap-1 rounded-2xl py-1 pl-3 pr-1 text-right ${HAIRLINE}`}>
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-label text-ink">
          <b className="font-display text-[13px] normal-case tracking-normal">{selected.name}</b>
          <span
            className="ml-1.5"
            style={{ color: selected.ultimate ? "rgb(var(--gold))" : selected.color }}
          >
            {selected.role}
          </span>
          <span className="text-muted"> · pick a target</span>
        </p>
        <p className="mt-0.5 truncate font-mono text-[10.5px] tabular-nums text-graphite">
          {spellSummary(selected)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onSelectSpell(selected.id)}
        aria-label={`Put ${selected.name} down`}
        className="grid h-9 w-9 flex-none place-items-center rounded-full text-graphite transition-transform active:scale-90"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};

/** A key, drawn the way it looks under the fingers. */
export const Keycap: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({
  children,
  dark = false,
}) => (
  <kbd
    className={`inline-grid min-w-[18px] place-items-center rounded-[5px] px-1 font-sans text-[9.5px] font-extrabold not-italic leading-[16px] [text-shadow:none] ${
      dark
        ? "bg-[#2a1b00]/15 text-[#2a1b00] shadow-[inset_0_-1.5px_0_rgb(42_27_0/0.3)]"
        : "bg-night/70 text-graphite shadow-[inset_0_-1.5px_0_rgb(var(--rule))]"
    }`}
  >
    {children}
  </kbd>
);

/** How much of the turn is left, from 1 down to 0, ticking four times a second. */
const useTurnLeft = (
  turnEndsAt: number | undefined,
  active: boolean,
  /** Whether the turn is this player's: only then does it buzz at ten seconds. */
  mine: boolean
) => {
  const [left, setLeft] = useState({ share: 1, seconds: 0 });
  const total = useRef(1);
  const warned = useRef(false);
  useEffect(() => {
    if (!turnEndsAt || !active) return;
    total.current = Math.max(1, turnEndsAt - Date.now());
    warned.current = false;
    const tick = () => {
      const ms = Math.max(0, turnEndsAt - Date.now());
      const seconds = Math.ceil(ms / 1000);
      setLeft({ share: ms / total.current, seconds });
      // Once, at ten seconds: a player who looked away feels it.
      if (mine && seconds <= 10 && seconds > 0 && !warned.current) {
        warned.current = true;
        hapticHurry();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [turnEndsAt, active, mine]);
  return left;
};

/**
 * The one gold button of a fight — Fight while placing, End turn after — as
 * a disc in the bottom-right corner, where a right thumb rests without
 * reaching. It sat as a pill in the middle of the bottom edge before, a
 * stretch away from both thumbs. While it is your turn the time left runs
 * round it as a ring, red for the last quarter, so the clock is where the
 * thumb already is. Where there is a keyboard it says which key presses it.
 */
export type MainActionProps = {
  label: string;
  /** A second line: what a cast takes off, what a walk costs. */
  detail?: string;
  /** Whose colour the detail is written in: a cast's, or a walk's. */
  tone?: "cast" | "move";
  disabled: boolean;
  onClick: () => void;
  beckon?: boolean;
};

export const MainAction: React.FC<
  MainActionProps & {
    /** When the turn runs out; the ring shows only while it is yours. */
    turnEndsAt?: number;
    timed?: boolean;
  }
> = ({ label, detail, tone, disabled, onClick, beckon, turnEndsAt, timed = false }) => {
  /*
   * The disc changes what it does under the thumb — Move, Cast, End turn —
   * so a press that lands just after it changed is dropped: a double tap on
   * Move must never end the turn with its second half.
   */
  const changedAt = useRef(0);
  useEffect(() => {
    changedAt.current = Date.now();
  }, [label]);
  // The ring runs on every turn: gold on yours, the page's rule on someone
  // else's, so the disc also says how long the wait is.
  const { share, seconds } = useTurnLeft(turnEndsAt, timed, !disabled);
  const hurry = timed && !disabled && seconds > 0 && seconds <= 10;
  const r = 47;
  const c = 2 * Math.PI * r;
  // "End turn" on two lines, so the disc can stay a thumb's size.
  const [first, ...rest] = label.split(" ");
  return (
    <div className="relative h-[104px] w-[104px] flex-none">
      {timed && (
        <svg aria-hidden viewBox="0 0 104 104" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx={52} cy={52} r={r} fill="none" className="stroke-night/80" strokeWidth={5} />
          <circle
            cx={52}
            cy={52}
            r={r}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(1, share)))}
            style={{
              stroke: disabled
                ? "rgb(var(--rule))"
                : hurry
                  ? "rgb(var(--vermilion))"
                  : "rgb(var(--gold))",
              transition: "stroke-dashoffset 250ms linear",
            }}
          />
        </svg>
      )}
      <button
        type="button"
        onClick={() => {
          if (Date.now() - changedAt.current < 350) return;
          onClick();
        }}
        disabled={disabled}
        className={`btn-gold absolute inset-[9px] flex flex-col items-center justify-center gap-0.5 rounded-full text-center font-display text-[16px] font-bold leading-[1.05] ${
          beckon ? "animate-beckon" : ""
        }`}
      >
        <span>
          {first}
          {rest.length > 0 && (
            <>
              <br />
              {rest.join(" ")}
            </>
          )}
        </span>
        {detail && (
          <span
            className={`max-w-[72px] truncate rounded-full px-1.5 font-mono text-[10px] font-extrabold tabular-nums [text-shadow:none] ${
              disabled
                ? "text-muted"
                : tone === "cast"
                  ? "bg-vermilion text-white"
                  : tone === "move"
                    ? "bg-[#1f7a35] text-white"
                    : "text-[#2a1b00]/70"
            }`}
          >
            {detail}
          </span>
        )}
        {!disabled && !detail && (
          <span className="touch:hidden">
            <Keycap dark>Space</Keycap>
          </span>
        )}
      </button>
    </div>
  );
};
