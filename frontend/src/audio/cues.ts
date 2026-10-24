import { Player, Position } from "../types/game";
import { GameState, GroundCell, LogEntry } from "../types/message";
import type { CryVoice, Surface } from "./sfx";
import { infused } from "../utils/spellUtils";
import type { Element } from "../vfx/spellFx";

/**
 * What a fight should sound like between two of its states.
 *
 * The server sends whole states, not events, so — like the hit numbers and
 * the spell effects — a sound is a difference between the state before and
 * the state now. Kept pure, and apart from the audio, so it can be checked
 * against plain objects in a test.
 *
 * Casts come from the log, which says which spell went where; what they did
 * to each fighter comes from the fighters' own numbers, which is also what
 * catches a burn ticking at the start of a turn, where no spell was cast.
 */
export type Cue =
  | { kind: "cast"; element: Element; heavy: boolean; from: Position; to: Position; damage: number; crit: boolean; moves: boolean }
  | { kind: "beat"; element: Element; at: Position }
  | { kind: "hurt"; at: Position; amount: number; voice: CryVoice }
  | { kind: "heal"; at: Position }
  | { kind: "shield"; at: Position }
  | { kind: "drain"; at: Position }
  | { kind: "death"; at: Position; voice: CryVoice }
  | { kind: "turn" }
  | { kind: "fightStart" };

const ELEMENTS: Element[] = ["Fire", "Air", "Water", "Earth"];
const isElement = (value: string | undefined): value is Element => !!value && (ELEMENTS as string[]).includes(value);

/**
 * The voice a fighter cries out in: one of the recorded voices, played a
 * little higher or lower. Each fighter keeps theirs for the whole fight,
 * taken from their name, so two fighters hit by the same spell are still
 * told apart by ear. A dream's monsters are played slow and deep: they roar
 * rather than shout.
 */
export const voiceOf = (player: Pick<Player, "monster"> & { character: { name: string } }): CryVoice => {
  let h = 0;
  for (const c of player.character.name) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  const u = h >>> 0;
  const rate = 0.92 + ((u >>> 2) % 1000) / 1000 * 0.18;
  return { singer: u % 4, rate: player.monster ? rate * 0.72 : rate };
};

/** The highest log number in a state, or 0 for an empty log. */
export const lastSeq = (state: GameState | null | undefined): number =>
  (state?.log ?? []).reduce((max, entry) => Math.max(max, entry.seq), 0);

const castCue = (state: GameState, entry: LogEntry): Cue | null => {
  if (entry.kind !== "cast" || entry.spellId === undefined || !entry.origin || !entry.target) return null;
  const raw = state.spells?.[String(entry.spellId)];
  const spell = raw && infused(raw, entry.infusion);
  if (!spell || !isElement(spell.element)) return null;
  // What earns the long, low version: anything that shakes the whole board.
  const heavy =
    spell.ultimate ||
    !!spell.legend ||
    spell.special === "quake" ||
    spell.special === "crater" ||
    spell.zone?.kind === "storm" ||
    spell.zone?.kind === "maelstrom";
  return {
    kind: "cast",
    element: spell.element,
    heavy,
    from: entry.via ?? entry.origin,
    to: entry.target,
    damage: entry.damage ?? 0,
    crit: !!entry.crit,
    moves: spell.push !== 0 || spell.special === "leap" || spell.special === "swap",
  };
};

/**
 * The cues between `before` and `after`, for the player `userId`.
 *
 * `seen` is the last log number already sounded, or null for the first state
 * this board receives: a player joining or refreshing mid-fight hears nothing
 * of what happened before they arrived. A rematch empties the server's log,
 * which shows as a highest number below `seen`; that is a fresh start too.
 */
export const fightCues = (
  before: GameState | null,
  after: GameState,
  userId: string,
  seen: number | null
): { cues: Cue[]; seen: number } => {
  const highest = lastSeq(after);
  if (seen === null || highest < seen || !before) return { cues: [], seen: highest };

  const cues: Cue[] = [];

  if (before.status !== "playing" && after.status === "playing") cues.push({ kind: "fightStart" });

  for (const entry of after.log ?? []) {
    if (entry.seq <= seen) continue;
    if (entry.kind === "cast") {
      const cue = castCue(after, entry);
      if (cue) cues.push(cue);
      if (entry.target && (entry.shieldChange ?? 0) > 0) cues.push({ kind: "shield", at: entry.target });
    } else if (entry.kind === "effect" && entry.spellId !== undefined && entry.target) {
      // A beat of a legendary's drums, struck on a cell between turns.
      const element = entry.infusion ?? after.spells?.[String(entry.spellId)]?.element;
      if (isElement(element)) cues.push({ kind: "beat", element, at: entry.target });
    }
  }

  for (const id in after.players) {
    const now = after.players[id].character;
    const then = before.players[id]?.character;
    if (!then) continue;
    const at = now.position ?? then.position;
    if (!at) continue;

    if (then.isAlive && !now.isAlive) {
      cues.push({ kind: "death", at, voice: voiceOf(after.players[id]) });
      continue;
    }
    if (now.health < then.health) {
      cues.push({ kind: "hurt", at, amount: then.health - now.health, voice: voiceOf(after.players[id]) });
    }
    if (now.health > then.health && then.isAlive) cues.push({ kind: "heal", at });

    // Points the fighter whose turn it is spent themselves are not a drain;
    // nor is anyone's refill as a turn comes round.
    const acting = now.isCurrentTurn || then.isCurrentTurn;
    if (!acting && (now.actionPoints < then.actionPoints || now.movementPoints < then.movementPoints)) {
      cues.push({ kind: "drain", at });
    }
  }

  const me = after.players[userId];
  if (after.status === "playing" && me?.isCurrentTurn && !before.players[userId]?.isCurrentTurn) {
    cues.push({ kind: "turn" });
  }

  return { cues, seen: Math.max(seen, highest) };
};

/**
 * Where a cell sits across the screen, -1 to 1. The board is drawn on the
 * diagonal, so a cell's screen x follows x - y; the board is at most fifteen
 * cells across.
 */
export const panOf = (p: Position): number => Math.max(-1, Math.min(1, (p.x - p.y) / 14));

/** What a fighter's feet land on, read off the island's ground. */
export const surfaceOf = (
  ground: GroundCell[] | null | undefined,
  island: string | undefined,
  p: Position
): Surface => {
  const kind = ground?.find((cell) => cell.position.x === p.x && cell.position.y === p.y)?.kind;
  switch (kind) {
    case "shallow_water":
    case "acid_pool":
      return "water";
    case "ice":
      return "ice";
    case "tall_grass":
      return "grass";
    case undefined:
      // A plain arena is flagstones; an island's bare ground is its turf.
      return island ? "grass" : "stone";
    default:
      return "dirt";
  }
};
