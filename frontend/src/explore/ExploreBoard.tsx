import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Position } from "../types/game";
import { isoToScreen, screenToIso } from "../utils/isoUtils";
import { followPan } from "../utils/camera";
import { useTileSize } from "../hooks/useTileSize";
import { Character } from "../components/Game/Grid/Character";
import { useWalker } from "./useWalker";
import { resolveWorldZoom, visibleCells } from "./viewport";
import { findPath, heightAt, MAX_LEVEL, standingHeight, walkable } from "./world";
import { LEVEL_RISE, paintWorld, Scene } from "./paint";

/**
 * The world is drawn at the size a fight's board would be drawn at, times the
 * camera's zoom. It is an indirection, and it earns it: a step across the
 * paper is then the same size step it is in a fight, on every screen, and the
 * one piece of sizing in this project that has been fought over on real
 * phones stays the only piece of sizing there is.
 */
const FIGHT_SPAN = 15;

/** Read once: it cannot change without a reload. */
const zoom =
  typeof window === "undefined" ? 1 : resolveWorldZoom(window.location.search);

export const ExploreBoard: React.FC<{ color?: string }> = ({ color }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    tile,
    size,
    measured,
  } = useTileSize(containerRef, FIGHT_SPAN, zoom);
  const walker = useWalker();
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
  const scene = useRef<Omit<Scene, "time"> | null>(null);
  const lastPaint = useRef(0);
  const paint = useCallback(() => {
    const behind = behindRef.current;
    const front = frontRef.current;
    if (!behind || !front || !scene.current) return;
    const now = performance.now();
    lastPaint.current = now;
    paintWorld(behind, front, { ...scene.current, time: now / 1000 });
  }, []);

  useLayoutEffect(() => {
    if (!measured) return;
    scene.current = {
      width: size.width,
      height: size.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      tile,
      origin: { x: centreX + pan.x, y: centreY + pan.y },
      cells,
      walker: walker.at,
      hovered,
      route: preview,
    };
    paint();
  }, [size, tile, pan, centreX, centreY, cells, walker.at, hovered, preview, measured, paint]);

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
      <canvas
        ref={behindRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      />
      {/*
        The figure is drawn between two sheets rather than over the whole
        world: what stands behind it is on the first, what stands in front of
        it on the second, so it passes behind a boulder instead of sliding
        across its face. It is a sprite, not ink, so it keeps its own layer,
        panned by the camera like the paper under it.
      */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          // No easing: the pan is rewritten every frame from an already
          // interpolated position, so there is nothing left to smooth and an
          // ease would only leave the paper trailing behind the figure on it.
          visibility: measured ? undefined : "hidden",
          pointerEvents: "none",
        }}
      >
        <Character
          screenPosition={hero}
          animation={walker.moving ? "walk" : "idle"}
          direction={walker.direction}
          scale={tile.width / 256}
          color={color}
        />
      </div>
      <canvas
        ref={frontRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
};
