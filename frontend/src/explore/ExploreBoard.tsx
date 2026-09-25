import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Position } from "../types/game";
import { isoToScreen, screenToIso } from "../utils/isoUtils";
import { followPan } from "../utils/camera";
import { useTileSize } from "../hooks/useTileSize";
import { useWalker } from "./useWalker";
import { visibleCells } from "./viewport";
import { findPath, heightAt, MAX_LEVEL, SPAWN, standingHeight, walkable } from "./world";
import { ART_TILE, LEVEL_RISE, paintWorld, Phase, phaseAt, Scene } from "./paint";

/**
 * How many screen pixels one pixel of art takes. The world is pixel art, so
 * it only ever grows by whole numbers: a cell is 64 pixels of art, and a
 * screen pixel count that is not a multiple of that would smear them. Three
 * on a screen large enough, for pixels that read as pixels; two on a phone,
 * where three would leave barely three cells across.
 *
 * `?pixel=4` on the world's URL forces another size, to try one.
 */
const pixelScaleFor = (width: number, height: number): number => {
  const asked = typeof window === "undefined" ? NaN : Number(new URLSearchParams(window.location.search).get("pixel"));
  if (Number.isInteger(asked) && asked >= 1 && asked <= 6) return asked;
  return width >= 900 && height >= 520 ? 3 : 2;
};

/**
 * Where the walk starts: the spawn, or `?at=x,y` on the world's URL to arrive
 * straight in a boss's region — the map is large, and checking how one of
 * its far corners looks should not take a five-minute walk.
 */
const startCell = (): Position => {
  const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("at");
  const [x, y] = (asked ?? "").split(",").map(Number);
  return Number.isInteger(x) && Number.isInteger(y) && walkable({ x, y }) ? { x, y } : SPAWN;
};

/**
 * What time it is in the world. By default the world stays in daylight; asked
 * to follow the clock, it turns to dusk and then to night with the player's
 * own hour.
 */
export type Daylight = "day" | "clock";

/** Draws the world; hand it its islands with setWorldContent before mounting it. */
export const ExploreBoard: React.FC<{ color?: string; daylight?: Daylight }> = ({ color, daylight = "day" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Only the container's size is taken from here: the tile is set by the pixel grid.
  const { size, measured } = useTileSize(containerRef, 15, 1);
  const px = pixelScaleFor(size.width, size.height);
  const tile = useMemo(() => ({ width: ART_TILE * px, height: (ART_TILE / 2) * px }), [px]);
  // The ground is only known once the islands are, so this is asked on mount.
  const [start] = useState(startCell);
  const walker = useWalker(start);
  const [hovered, setHovered] = useState<Position | null>(null);

  const centreX = size.width / 2;
  const centreY = size.height / 2;

  /*
   * The whole point, in two lines: the figure is projected like anything
   * else, and the layer under it is panned by exactly what it takes to put
   * that projection in the middle of the screen. Nothing else on the board
   * knows — see camera.ts.
   */
  const rise = tile.height * LEVEL_RISE;
  const flat = isoToScreen(walker.at.x, walker.at.y, tile, centreX, centreY);
  // Up a terrace, the figure stands as high as the ground under it, and the
  // camera follows the figure rather than the cell.
  const hero = { x: flat.x, y: flat.y - heightAt(walker.at) * rise };
  const pan = useMemo(
    () => followPan(hero, { x: centreX, y: centreY }, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hero.x, hero.y, centreX, centreY]
  );

  const cells = useMemo(
    () => visibleCells(size, tile, pan),
    [size, tile, pan]
  );

  /**
   * Where a click or a hover actually landed, undoing the camera's pan. The
   * ground is not flat, so the point is tried against every terrace height —
   * and halfway up, for a stair — and of the cells whose top is under the
   * pointer, the one furthest forward wins: it is the one drawn last, so it
   * is the one you can see.
   */
  const cellUnder = useCallback(
    (clientX: number, clientY: number): Position | null => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return null;
      let best: Position | null = null;
      for (let height = 0; height <= MAX_LEVEL; height += 0.5) {
        const at = screenToIso(
          clientX - box.left - pan.x,
          clientY - box.top - pan.y + height * rise,
          tile,
          centreX,
          centreY
        );
        if (standingHeight(at) !== height) continue;
        if (!best || at.x + at.y >= best.x + best.y) best = at;
      }
      return best && walkable(best) ? best : null;
    },
    [pan, tile, rise, centreX, centreY]
  );

  /*
   * The pointer is still, but the ground under it is not. A hover kept as the
   * cell it first landed on drifts away with the paper, and by the end of a
   * walk the board is offering to walk you to a cell nowhere near the cursor.
   * So it is re-read from the last pointer position whenever the camera moves.
   */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const seen = pointer.current;
    const under = seen ? cellUnder(seen.x, seen.y) : null;
    setHovered((prev) => {
      if (prev === under) return prev;
      if (prev && under && prev.x === under.x && prev.y === under.y) return prev;
      return under;
    });
  }, [cellUnder]);

  // The route a click would take, so the ground says where you would go
  // before you commit to going there.
  const preview = useMemo(() => {
    if (!hovered || walker.moving) return new Set<string>();
    const route = findPath(walker.cell, hovered);
    return new Set((route ?? []).map((c) => `${c.x},${c.y}`));
  }, [hovered, walker.cell, walker.moving]);

  const behindRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  /*
   * Painted before the browser paints, so the ground and the figure on it
   * always arrive in the same frame — a camera a frame behind its walker
   * shows as the figure shuddering against the paper.
   */
  const scene = useRef<Omit<Scene, "time" | "phase"> | null>(null);
  const daylightRef = useRef(daylight);
  daylightRef.current = daylight;
  const lastPaint = useRef(0);
  const paint = useCallback(() => {
    const behind = behindRef.current;
    const front = frontRef.current;
    if (!behind || !front || !scene.current) return;
    const now = performance.now();
    lastPaint.current = now;
    const clock = new Date();
    const phase: Phase = daylightRef.current === "clock" ? phaseAt(clock.getHours() + clock.getMinutes() / 60) : "day";
    paintWorld(behind, front, { ...scene.current, time: now / 1000, phase });
  }, []);

  useLayoutEffect(() => {
    if (!measured) return;
    scene.current = {
      width: size.width,
      height: size.height,
      px,
      origin: { x: centreX + pan.x, y: centreY + pan.y },
      cells,
      walker: walker.at,
      hovered,
      route: preview,
      hero: { pose: walker.moving ? "walk" : "idle", direction: walker.direction, color },
    };
    paint();
  }, [size, px, pan, centreX, centreY, cells, walker.at, walker.moving, walker.direction, color, hovered, preview, measured, paint, daylight]);

  /*
   * The wind keeps the world moving while nothing else does. It needs no
   * more than thirty frames a second to read as wind, and a world standing
   * still should not cost a phone its battery at sixty; while the walker is
   * moving, the layout effect above is already painting every frame.
   */
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastPaint.current >= 33) paint();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  const pixelStyle: React.CSSProperties = {
    width: `${Math.ceil(size.width / px) * px}px`,
    height: `${Math.ceil(size.height / px) * px}px`,
    imageRendering: "pixelated",
    pointerEvents: "none",
    visibility: measured ? undefined : "hidden",
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none"
      style={{ cursor: hovered ? "pointer" : "default" }}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
        setHovered(cellUnder(e.clientX, e.clientY));
      }}
      onPointerLeave={() => {
        pointer.current = null;
        setHovered(null);
      }}
      onClick={(e) => {
        const cell = cellUnder(e.clientX, e.clientY);
        if (cell) walker.walkTo(cell);
      }}
    >
      {/*
        Two sheets, the walker drawn on the first: what stands behind the
        walker is under it, what stands in front on the second sheet, so it
        passes behind a boulder instead of sliding across its face. Each
        canvas holds the art at its own resolution and is shown a whole
        number of times larger, without smoothing, so every pixel stays a
        square.
      */}
      <canvas ref={behindRef} className="absolute left-0 top-0" style={pixelStyle} />
      <canvas ref={frontRef} className="absolute left-0 top-0" style={pixelStyle} />
    </div>
  );
};
