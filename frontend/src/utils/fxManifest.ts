import { useEffect, useState } from "react";

/**
 * The spell sheets drawn in the armour grimoire, and which of them each spell
 * plays. They live in public/animation/fx/ beside a manifest.json that says,
 * for every sheet, how it is cut and where it stands on a cell, and, for every
 * spell id in spells.json, the pose the caster strikes and the sheets to play.
 */

/** One sheet: frames side by side, and a row per direction when it has them. */
export type FxSheet = {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  loop: boolean;
  /** Under the fighters, standing among them, or over them. */
  layer: "ground" | "standing" | "air";
  /** The point of a frame that sits on the centre of its cell. */
  anchor: [number, number];
  /** Row order of a sheet drawn once per direction, like a projectile. */
  directions?: string[] | null;
};

/** The pose an outfit strikes for a spell: its weapon, a throw, or none. */
export type HeroPose = "AttackMelee" | "AttackRanged" | null;

export type FxSpell = {
  name: string;
  hero: HeroPose;
  /** "element/sheet" keys, in the order they play. */
  fx: string[];
};

export type FxManifest = {
  fire: Record<string, FxSheet>;
  air: Record<string, FxSheet>;
  water: Record<string, FxSheet>;
  earth: Record<string, FxSheet>;
  spells: Record<string, FxSpell>;
};

/** The sheet a "element/name" key names, if the manifest has it. */
export const sheetOf = (manifest: FxManifest, key: string): FxSheet | undefined => {
  const [element, name] = key.split("/");
  const sheets = (manifest as unknown as Record<string, Record<string, FxSheet> | undefined>)[element];
  return sheets?.[name];
};

/** Where the sheets live. */
export const FX_ROOT = "/animation/fx/";

let pending: Promise<FxManifest | null> | null = null;

const load = (): Promise<FxManifest | null> => {
  if (!pending) {
    pending = fetch(`${FX_ROOT}manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<FxManifest>) : null))
      .catch(() => null);
  }
  return pending;
};

/**
 * The manifest, fetched once per page load. Null until it arrives, and for
 * good if it cannot: spells are then drawn by the procedural effects alone.
 */
export const useFxManifest = (): FxManifest | null => {
  const [manifest, setManifest] = useState<FxManifest | null>(null);
  useEffect(() => {
    let live = true;
    load().then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, []);
  return manifest;
};

/** An outfit's attack for a spell: a swing of its weapon, a throw, or none. */
export type AttackKind = "melee" | "ranged" | "none";

export const attackKindOf = (
  spellId: number | undefined,
  manifest: FxManifest | null
): AttackKind => {
  if (spellId === undefined || !manifest) return "ranged";
  const hero = manifest.spells[String(spellId)]?.hero;
  if (hero === undefined) return "ranged";
  return hero === "AttackMelee" ? "melee" : hero === "AttackRanged" ? "ranged" : "none";
};

/** Where an outfit's sheet for an animation is. */
export const outfitSheet = (
  sprite: string,
  sheet: "Idle" | "Walk" | "AttackMelee" | "AttackRanged"
): string => `/animation/outfits/${sprite}/${sheet}.png`;
