import React, { useEffect, useRef } from "react";
import { GameState } from "../../../types/message";
import { CastEvent, Element, Signature, SpellFx } from "../../../vfx/spellFx";
import { Spell } from "../../../types/message";
import { calculateImpactedCells, infused } from "../../../utils/spellUtils";
import { useFxManifest } from "../../../utils/fxManifest";
import { LegendCast, SheetFx } from "../../../vfx/sheetFx";
import { Position } from "../../../types/game";
import { LASTING_SHEETS } from "../../../vfx/lastingSheets";

/** Which spells are drawn as themselves rather than as their element. */
const signatureOf = (spell: Spell): Signature | undefined => {
  if (spell.special === "leap") return "leap";
  if (spell.special === "pillar") return "pillar";
  if (spell.element === "Water" && spell.push > 0) return "cannon";
  if (spell.element === "Earth" && spell.range === 1) return "hammer";
  if (spell.special === "relay") return "relay";
  if (spell.special === "swap") return "swap";
  if (spell.special === "quake") return "quake";
  if (spell.special === "crater") return "meteor";
  if (spell.zone?.kind === "storm") return "tempest";
  if (spell.zone?.kind === "maelstrom") return "maelstrom";
  if (spell.targeting === "self") return "self";
  return undefined;
};

/*
 * The legendaries' attacks in the bestiary: the first is 20 frames, the
 * second 24. The Ashen King casts Judgement of Lightning, his second, when
 * his blade is infused with air; everyone else casts their first.
 */
const legendFor = (legend: string, element: string): { file: string; frames: number } =>
  legend === "legend_roi_cendre" && element === "Air"
    ? { file: `${legend}_attack2.webp`, frames: 24 }
    : { file: `${legend}_attack.webp`, frames: 20 };

/** What lands where a legendary's blow falls, in the element it was cast in. */
const legendImpact = (element: string): string[] => {
  const el = element.toLowerCase();
  switch (el) {
    case "fire":
      return ["fire/combustion"];
    case "air":
      return ["air/lightning", "air/impact"];
    default:
      return [`${el}/impact`];
  }
};

/**
 * Where a legendary stands to cast: two cells behind the caster, away from
 * the target, so it towers over them rather than on them — one cell at the
 * edge of the board, and the caster's own cell with no room at all.
 */
const behind = (caster: Position, target: Position): Position => {
  const dx = caster.x - target.x;
  const dy = caster.y - target.y;
  const step =
    Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  for (const n of [2, 1]) {
    const p = { x: caster.x + step.x * n, y: caster.y + step.y * n };
    if (Math.abs(p.x) + Math.abs(p.y) <= 7) return p;
  }
  return caster;
};

interface SpellFXLayerProps {
  latestGameState?: GameState | null;
  tileSize: { width: number; height: number };
  centerX: number;
  centerY: number;
  /**
   * The board, and only the board. A hit shakes the ground the fight is
   * standing on; it must not shake the panels and the log around it, which
   * would read as the application glitching rather than as an impact.
   */
  boardRef: React.RefObject<HTMLDivElement>;
  /**
   * The element the rest of the board already measures itself against. The
   * canvases must not be sized from their own parent: a canvas that ever falls
   * into normal flow would then stretch the box it is measured from, and the
   * two would grow into each other until the browser's size cap.
   */
  containerRef: React.RefObject<HTMLDivElement>;
}

const ELEMENTS: Element[] = ["Fire", "Air", "Water", "Earth"];
const isElement = (value: string | undefined): value is Element =>
  !!value && (ELEMENTS as string[]).includes(value);

/**
 * Draws what a spell does to the board. The server now says which spell was
 * cast and between which cells, so each element can be drawn as itself rather
 * than as the one generic attack pose every spell used to share.
 */
export const SpellFXLayer: React.FC<SpellFXLayerProps> = ({
  latestGameState,
  tileSize,
  centerX,
  centerY,
  boardRef,
  containerRef,
}) => {
  const groundRef = useRef<HTMLCanvasElement>(null);
  const airRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<SpellFx | null>(null);
  // The grimoire's sheets, for every spell the manifest draws. Null until the
  // manifest arrives, and then those spells play their sheets instead of the
  // procedural animation; the marks they leave are still the procedural ones.
  const manifest = useFxManifest();
  const sheetsRef = useRef<SheetFx | null>(null);
  const geometryRef = useRef({ tileSize, centerX, centerY });
  const landings = useRef<number[]>([]);
  const frameRef = useRef<number | null>(null);
  /** Null until the first state arrives, which is what marks a fresh join. */
  const seenSeq = useRef<number | null>(null);

  const draw = React.useCallback(() => {
    if (frameRef.current !== null) return;
    const step = () => {
      const fx = fxRef.current;
      if (!fx) {
        frameRef.current = null;
        return;
      }
      const now = performance.now();
      fx.frame(now);
      const sheets = sheetsRef.current;
      const ground = groundRef.current?.getContext("2d");
      const air = airRef.current?.getContext("2d");
      if (sheets && ground && air) sheets.frame(now, ground, air);

      const board = boardRef.current;
      if (board) {
        const { x, y } = fx.shakeOffset(now);
        board.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
      }

      if (fx.busy || sheetsRef.current?.busy) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        frameRef.current = null;
        if (board) board.style.transform = "";
      }
    };
    frameRef.current = requestAnimationFrame(step);
  }, [boardRef]);

  useEffect(() => {
    if (!groundRef.current || !airRef.current) return;
    fxRef.current = new SpellFx(groundRef.current, airRef.current);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      fxRef.current = null;
      for (const id of landings.current) window.clearTimeout(id);
      landings.current = [];
    };
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const sheets = new SheetFx(manifest);
    sheets.resize(geometryRef.current);
    for (const spell of Object.values(manifest.spells)) sheets.preload(spell);
    sheetsRef.current = sheets;
    return () => {
      sheetsRef.current = null;
    };
  }, [manifest]);

  // The canvas follows the board's own size, and every scar is repainted from
  // grid coordinates so a resize cannot move the history of the fight.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apply = () => {
      const fx = fxRef.current;
      if (!fx) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      geometryRef.current = { tileSize, centerX, centerY };
      fx.resize(width, height, geometryRef.current);
      sheetsRef.current?.resize(geometryRef.current);
      draw();
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tileSize, centerX, centerY, draw, containerRef]);

  useEffect(() => {
    const fx = fxRef.current;
    const log = latestGameState?.log;
    const spells = latestGameState?.spells;
    if (!fx || !log || !spells) return;

    const toEvent = (entry: (typeof log)[number]): CastEvent | null => {
      if (entry.kind !== "cast") return null;
      if (entry.spellId === undefined || !entry.origin || !entry.target) return null;
      const raw = spells[String(entry.spellId)];
      const spell = raw && infused(raw, entry.infusion);
      const element = spell?.element;
      if (!spell || !isElement(element)) return null;
      return {
        seq: entry.seq,
        element,
        origin: entry.origin,
        target: entry.target,
        crit: !!entry.crit,
        damage: entry.damage ?? 0,
        signature: signatureOf(spell),
        via: entry.via,
        area: calculateImpactedCells(spell, entry.target, entry.via ?? entry.origin),
        terrain: spell.terrain,
      };
    };

    const highest = log.reduce((max, entry) => Math.max(max, entry.seq), 0);

    // A rematch resets the server's log to empty. The canvas only ever gets
    // drawn onto, so without this the previous fight's scars would still be
    // sitting on a board that is meant to come back clean.
    if (seenSeq.current !== null && highest < seenSeq.current) {
      fx.reset();
      sheetsRef.current?.reset();
      for (const id of landings.current) window.clearTimeout(id);
      landings.current = [];
      seenSeq.current = null;
    }

    if (seenSeq.current === null) {
      /*
       * A fresh join, or a refresh mid-fight. The marks are permanent, so the
       * board has to come back already carrying them — but replaying every
       * explosion that led to them would be nonsense.
       */
      for (const entry of log) {
        const event = toEvent(entry);
        if (event && !manifest?.spells[String(entry.spellId)]) fx.restore(event);
      }
      seenSeq.current = highest;
      draw();
      return;
    }

    const since = seenSeq.current;
    // The cast a cairn's wall rises against: where it came from, and how long
    // it takes to land, since the wall has to be up by then.
    let lastOrigin: Position | undefined;
    let lastLanding = 0;
    const standing = (name: string): Position | undefined =>
      Object.values(latestGameState?.players ?? {}).find((p) => p.character.name === name)?.character
        .position ?? undefined;
    const sheets = sheetsRef.current;
    for (const entry of log) {
      if (entry.seq <= since) continue;
      // A Stonewarden's cairn taking a blow for them: a wall of rock bursts up
      // in front of them, facing where the blow came from, and explodes.
      if (entry.kind === "effect" && entry.text === "is covered by their pillar" && sheets) {
        const at = standing(entry.actor);
        if (at) sheets.playRampart(at, lastOrigin ?? { x: at.x, y: at.y + 1 }, lastLanding);
        continue;
      }
      // A beat of Fulgor's drums: lightning on the cell, in its element.
      if (entry.kind === "effect" && entry.spellId && entry.target && sheets) {
        const element = entry.infusion ?? spells[String(entry.spellId)]?.element ?? "Air";
        sheets.play({
          spell: { name: "beat", hero: null, fx: ["air/lightning", ...legendImpact(element)] },
          origin: entry.target,
          target: entry.target,
          area: [entry.target],
        });
        continue;
      }
      const event = toEvent(entry);
      if (!event) continue;
      const drawn = sheets && manifest?.spells[String(entry.spellId)];
      if (!sheets || !drawn) {
        fx.play(event);
        lastOrigin = event.via ?? event.origin;
        lastLanding = 300;
        continue;
      }
      // The grimoire's sheets play the cast, from start to finish. It leaves
      // no ink of the procedural effects behind: what stays on the board is
      // the terrain the server keeps, drawn with the same sheets.
      const raw = spells[String(entry.spellId)];
      let legend: LegendCast | undefined;
      let keys = drawn.fx;
      if (raw?.legend) {
        // The legendary steps in: behind its caster, or, for one that carries
        // its caster under the ground, where they come out.
        const leap = raw.special === "leap";
        legend = {
          ...legendFor(raw.legend, event.element),
          at: leap ? event.target : behind(event.origin, event.target),
          facing: leap ? event.origin : event.target,
        };
        keys = legendImpact(event.element);
      }
      lastOrigin = event.via ?? event.origin;
      lastLanding = sheets.play({
        spell: { ...drawn, fx: keys.filter((key) => !LASTING_SHEETS.has(key)) },
        origin: event.origin,
        via: event.via,
        target: event.target,
        area: event.area ?? [event.target],
        swap: event.signature === "swap",
        legend,
      });
    }
    seenSeq.current = Math.max(since, highest);
    draw();
  }, [latestGameState, draw, manifest]);

  return (
    <>
      <canvas
        ref={groundRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
      <canvas
        ref={airRef}
        className="absolute inset-0 pointer-events-none z-10"
        aria-hidden="true"
      />
    </>
  );
};
