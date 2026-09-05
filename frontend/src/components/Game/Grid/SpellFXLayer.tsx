import React, { useEffect, useRef } from "react";
import { GameState } from "../../../types/message";
import { CastEvent, Element, SpellFx } from "../../../vfx/spellFx";

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

      const board = boardRef.current;
      if (board) {
        const { x, y } = fx.shakeOffset(now);
        board.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
      }

      if (fx.busy) {
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
    };
  }, []);

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
      fx.resize(width, height, { tileSize, centerX, centerY });
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
      const element = spells[String(entry.spellId)]?.element;
      if (!isElement(element)) return null;
      return {
        seq: entry.seq,
        element,
        origin: entry.origin,
        target: entry.target,
        crit: !!entry.crit,
        damage: entry.damage ?? 0,
      };
    };

    const highest = log.reduce((max, entry) => Math.max(max, entry.seq), 0);

    // A rematch resets the server's log to empty. The canvas only ever gets
    // drawn onto, so without this the previous fight's scars would still be
    // sitting on a board that is meant to come back clean.
    if (seenSeq.current !== null && highest < seenSeq.current) {
      fx.reset();
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
        if (event) fx.restore(event);
      }
      seenSeq.current = highest;
      draw();
      return;
    }

    const since = seenSeq.current;
    for (const entry of log) {
      if (entry.seq <= since) continue;
      const event = toEvent(entry);
      if (event) fx.play(event);
    }
    seenSeq.current = Math.max(since, highest);
    draw();
  }, [latestGameState, draw]);

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
