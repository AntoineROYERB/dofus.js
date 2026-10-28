/**
 * What the player chose to hear, remembered on this device.
 *
 * Two volumes rather than one switch: a player on a bus may want the hits and
 * not the music, and someone playing a podcast the other way round. Muting
 * keeps both levels, so turning sound back on returns it as it was.
 */
export type SoundSettings = {
  muted: boolean;
  /** 0 to 1. */
  music: number;
  /** 0 to 1. */
  effects: number;
};

export const DEFAULT_SETTINGS: SoundSettings = { muted: false, music: 0.6, effects: 0.8 };

const KEY = "sound.settings";

const clamp = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Whatever is stored, made safe: an old or hand-edited value never throws. */
export const parseSettings = (raw: string | null): SoundSettings => {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted: value.muted === true,
      music: clamp(value.music, DEFAULT_SETTINGS.music),
      effects: clamp(value.effects, DEFAULT_SETTINGS.effects),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

let current: SoundSettings | null = null;
const listeners = new Set<(settings: SoundSettings) => void>();

export const readSettings = (): SoundSettings => {
  if (current) return current;
  try {
    current = parseSettings(localStorage.getItem(KEY));
  } catch {
    // No storage (a private window, a test): the defaults, for this page.
    current = DEFAULT_SETTINGS;
  }
  return current;
};

export const writeSettings = (change: Partial<SoundSettings>): SoundSettings => {
  current = { ...readSettings(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // The choice still holds for as long as the page is open.
  }
  for (const listener of listeners) listener(current);
  return current;
};

export const onSettings = (listener: (settings: SoundSettings) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
