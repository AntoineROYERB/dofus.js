import React from "react";
import { BOARD } from "../../constants";

const RADIUS = 2;
const W = 96;
const H = 48;
const RISE = 10;

/**
 * The stand's own geometry, exported so whatever stands on it can be placed
 * with the board's arithmetic rather than by nudging a CSS offset until it
 * looks right. The origin is the centre of the middle tile.
 */
export const STAND = {
  tileWidth: W,
  viewBox: { x: -170, y: -100, width: 340, height: 190 },
  /** Where the middle tile's centre falls, as a share of the drawn box. */
  origin: { x: 170 / 340, y: 100 / 190 },
  /**
   * A sprite is drawn with its feet 70% of the way down its frame, the same
   * convention the board uses in Character.tsx.
   */
  feet: 0.7,
} as const;

const cells = (() => {
  const out: { x: number; y: number }[] = [];
  for (let x = -RADIUS; x <= RADIUS; x++) {
    for (let y = -RADIUS; y <= RADIUS; y++) {
      if (Math.abs(x) + Math.abs(y) <= RADIUS) out.push({ x, y });
    }
  }
  return out.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
})();

const diamond = (cx: number, cy: number) =>
  `${cx},${cy - H / 2} ${cx + W / 2},${cy} ${cx},${cy + H / 2} ${cx - W / 2},${cy}`;

/**
 * A few cells of the arena, drawn the same way the board draws them, for a
 * character to stand on while you name it. It is the one thing on the landing
 * page that says what the game is before you read a word of it.
 */
export const CharacterStand: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    viewBox={`${STAND.viewBox.x} ${STAND.viewBox.y} ${STAND.viewBox.width} ${STAND.viewBox.height}`}
    className={className}
    aria-hidden
    preserveAspectRatio="xMidYMid meet"
  >
    {/* The slab under the tiles: the same silhouette, dropped by a few pixels. */}
    <g transform={`translate(0, ${RISE})`} fill={BOARD.block.left}>
      {cells.map(({ x, y }) => (
        <polygon
          key={`d-${x}-${y}`}
          points={diamond(((x - y) * W) / 2, ((x + y) * H) / 2)}
        />
      ))}
    </g>
    {/*
      One surface, not the board's checker: the alternate tile is a shade off
      the page's own paper, which on a plinth this small read as holes with a
      character floating between them.
    */}
    {cells.map(({ x, y }) => (
      <polygon
        key={`${x}-${y}`}
        points={diamond(((x - y) * W) / 2, ((x + y) * H) / 2)}
        fill={BOARD.tile}
        stroke={BOARD.stroke}
        strokeWidth={1}
      />
    ))}
  </svg>
);

export default CharacterStand;
