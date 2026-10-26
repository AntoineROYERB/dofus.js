import { fr } from "./fr";

/*
 * The game speaks French by default, and English on request.
 *
 * The English text stays in the code as the key — `t("Find a game")` — so a
 * component still reads as what it shows, and the French dictionary is typed
 * against the keys it has: a string handed to `t` that the dictionary lacks
 * is a type error, not an English word left in a French screen.
 */

export type Lang = "fr" | "en";

export const LANGS: readonly { id: Lang; name: string }[] = [
  { id: "fr", name: "Français" },
  { id: "en", name: "English" },
];

export type Key = keyof typeof fr;
export type Vars = Record<string, string | number>;

const KEY = "dofusjs.lang";

const isLang = (value: unknown): value is Lang => value === "fr" || value === "en";

export const readLang = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Private browsing or blocked site data: the default stands.
  }
  return "fr";
};

export const saveLang = (lang: Lang): void => {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not remembered, but the switch still holds for this visit.
  }
};

/*
 * The language in force. A module variable rather than only React state so
 * that plain modules (the tutorial's steps, the terrain notes) can translate
 * too; the provider sets it before it re-renders, so they read the new one.
 */
let current: Lang = typeof window === "undefined" ? "fr" : readLang();

export const currentLang = (): Lang => current;

export const setCurrentLang = (lang: Lang): void => {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
};

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;

/** The text for `key` in `lang`, with `{name}` placeholders filled in. */
export const translate = (lang: Lang, key: Key, vars?: Vars): string =>
  fill(lang === "fr" ? fr[key] : key, vars);

/** `translate` in the language in force. */
export const t = (key: Key, vars?: Vars): string => translate(current, key, vars);

/**
 * One of two texts by count, with `{n}` filled in. French counts 0 as
 * singular and English does not, which is why this goes through the
 * language's own plural rules rather than `n === 1`.
 */
export const tn = (one: Key, other: Key, n: number, vars?: Vars): string =>
  t(new Intl.PluralRules(current).select(n) === "one" ? one : other, { n, ...vars });

/**
 * A text that arrives from elsewhere — a reason the server gave — translated
 * when the dictionary knows it, and shown as it came when it does not.
 */
export const tLoose = (text: string): string =>
  current === "fr" && Object.prototype.hasOwnProperty.call(fr, text) ? fr[text as Key] : text;
