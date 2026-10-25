/**
 * The fight's keyboard, in one place: what each key does, read off the key's
 * position rather than its character. `event.key` for the top-row 1 is "&" on
 * a French keyboard, so the number keys used to pick nothing at all for half
 * the people likely to play this; `event.code` is "Digit1" everywhere.
 */
export type Shortcut =
  | { kind: "spell"; slot: number }
  /** Whatever the gold button does now: Fight while placing, End turn after. */
  | { kind: "main" }
  /** Put the picked spell down, or open the menu when none is picked. */
  | { kind: "back" }
  | { kind: "menu" }
  | { kind: "help" };

export type KeyLike = { code: string; key: string };

export const shortcutFor = ({ code, key }: KeyLike): Shortcut | null => {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit) return { kind: "spell", slot: Number(digit[1]) };
  if (code === "Space" || code === "KeyP" || code === "Tab") return { kind: "main" };
  if (code === "Escape") return { kind: "back" };
  if (code === "KeyL") return { kind: "menu" };
  if (code === "KeyH" || key === "?") return { kind: "help" };
  return null;
};

/** The keys, as the help sheet lists them. */
export const SHORTCUT_SHEET: { keys: string[]; does: string }[] = [
  { keys: ["1", "–", "9"], does: "Pick a spell. The same key again puts it down." },
  { keys: ["Space"], does: "End your turn, or start the fight once you have picked a cell." },
  { keys: ["Esc"], does: "Put the picked spell down. With none picked, open the menu." },
  { keys: ["Right-click"], does: "Put the picked spell down." },
  { keys: ["L"], does: "Open the menu: log, chat and the ways out." },
  { keys: ["H"], does: "Show this list." },
];
