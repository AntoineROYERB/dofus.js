import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position } from "../types/game";
import { BOARD } from "../constants";
import { isoToScreen, screenToIso } from "../utils/isoUtils";
import { CAMERA_ZOOM, followPan } from "../utils/camera";
import { useTileSize } from "../hooks/useTileSize";
import { Character } from "../components/Game/Grid/Character";
import { useWalker } from "./useWalker";
import { visibleCells } from "./viewport";
import { findPath, isRock, walkable } from "./world";

/**
 * The world is drawn at the size a fight's board would be drawn at, times the
 * camera's zoom. It is an indirection, and it earns it: a step across the
 * paper is then the same size step it is in a fight, on every screen, and the
 * one piece of sizing in this project that has been fought over on real
 * phones stays the only piece of sizing there is.
 */
const FIGHT_SPAN = 15;

/** The ground, and what is standing on it. */
const Cell: React.FC<{
  screen: Position;
  tile: { width: number; height: number };
  rock: boolean;
  hovered: boolean;
  onPath: boolean;
}> = React.memo(({ screen, tile, rock, hovered, onPath }) => {
  const w = tile.width;
  const h = tile.height;
  const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
  const rise = rock ? h * BOARD.block.rise : 0;

  return (
    <div
      className="absolute"
      style={{
        left: `${screen.x - w / 2}px`,
        top: `${screen.y - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        // The container reads the pointer and does the arithmetic itself, so
        // no cell competes for a click meant for the ground.
        pointerEvents: "none",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        {rock ? (
          <g>
            <polygon
              points={`0,${h / 2} ${w / 2},${h} ${w / 2},${h - rise} 0,${h / 2 - rise}`}
              fill={BOARD.block.left}
            />
            <polygon
              points={`${w},${h / 2} ${w / 2},${h} ${w / 2},${h - rise} ${w},${h / 2 - rise}`}
              fill={BOARD.block.right}
            />
            <polygon
              points={points}
              transform={`translate(0, ${-rise})`}
              fill={BOARD.block.top}
              stroke={BOARD.block.stroke}
              strokeWidth={1}
            />
          </g>
        ) : (
          <>
            {/*
              No checker out here. The fight's board alternates its cells
              because a fight is counted in them — movement points, a spell's
              range, the walk it charges you for. Walking somewhere is not
              counted, so the grid stops being information and goes back to
              being a pattern over everything you look at. What is left is the
              paper, a seam faint enough to read as its texture, and a cell
              that answers when the pointer is on it.
            */}
            <polygon points={points} fill={BOARD.tile} stroke="none" />
            {onPath && (
              <circle
                cx={w / 2}
                cy={h / 2}
                r={Math.max(2, h * 0.07)}
                fill={BOARD.move}
                fillOpacity={0.5}
              />
            )}
            <polygon
              points={points}
              fill={hovered ? BOARD.move : "none"}
              fillOpacity={hovered ? 0.18 : 0}
              stroke={hovered ? BOARD.move : BOARD.stroke}
              strokeWidth={hovered ? BOARD.strokes.marked : BOARD.strokes.tile}
              strokeOpacity={hovered ? 1 : 0.4}
            />
          </>
        )}
      </svg>
    </div>
  );
});
Cell.displayName = "Cell";

export const ExploreBoard: React.FC<{ color?: string }> = ({ color }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    tile,
    size,
    measured,
  } = useTileSize(containerRef, FIGHT_SPAN, CAMERA_ZOOM);
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
  const hero = isoToScreen(walker.at.x, walker.at.y, tile, centreX, centreY);
  const pan = useMemo(
    () => followPan(hero, { x: centreX, y: centreY }, 1),
    [hero, centreX, centreY]
  );

  const cells = useMemo(
    () => visibleCells(size, tile, pan),
    [size, tile, pan]
  );

  /** Where a click or a hover actually landed, undoing the camera's pan. */
  const cellUnder = useCallback(
    (clientX: number, clientY: number): Position | null => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return null;
      const at = screenToIso(
        clientX - box.left - pan.x,
        clientY - box.top - pan.y,
        tile,
        centreX,
        centreY
      );
      return walkable(at) ? at : null;
    },
    [pan, tile, centreX, centreY]
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

  /*
   * Split at the walker's own depth. Its position is a fraction of a cell
   * mid-step, which is what makes the hand-off land in the right place: at
   * halfway between two rows, the nearer row is already in front of it.
   */
  const ground = useMemo(() => {
    const depth = walker.at.x + walker.at.y;
    return {
      behind: cells.filter((c) => c.x + c.y <= depth),
      inFront: cells.filter((c) => c.x + c.y > depth),
    };
  }, [cells, walker.at.x, walker.at.y]);

  const drawCell = (c: Position) => (
    <Cell
      key={`${c.x},${c.y}`}
      screen={isoToScreen(c.x, c.y, tile, centreX, centreY)}
      tile={tile}
      rock={isRock(c)}
      hovered={!!hovered && hovered.x === c.x && hovered.y === c.y}
      onPath={preview.has(`${c.x},${c.y}`)}
    />
  );

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
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          // No easing: the pan is rewritten every frame from an already
          // interpolated position, so there is nothing left to smooth and an
          // ease would only leave the paper trailing behind the figure on it.
          visibility: measured ? undefined : "hidden",
        }}
      >
        {ground.behind.map(drawCell)}
        {/*
          The figure is drawn among the ground, not over all of it. Nothing in
          this projection overlaps anything with a smaller x + y, so the walker
          belongs at its own sum: what is behind it is already down, what is in
          front of it comes after, and it passes behind a boulder instead of
          sliding across its face. The fight's board lays every fighter on top
          of everything, which it gets away with because its cover is sparse
          and its camera never walks you in among it. Out here the scenery is
          the only thing saying the paper moved, so it has to be believable.
        */}
        <Character
          screenPosition={hero}
          animation={walker.moving ? "walk" : "idle"}
          direction={walker.direction}
          scale={tile.width / 256}
          color={color}
        />
        {ground.inFront.map(drawCell)}
      </div>
    </div>
  );
};
