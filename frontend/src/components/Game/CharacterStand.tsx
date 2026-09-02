import React from "react";
import { BOARD } from "../../constants";

const RADIUS = 2;
const W = 96;
const H = 48;
const RISE = 10;

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
    viewBox="-170 -100 340 190"
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
    {cells.map(({ x, y }) => (
      <polygon
        key={`${x}-${y}`}
        points={diamond(((x - y) * W) / 2, ((x + y) * H) / 2)}
        fill={(Math.abs(x) + Math.abs(y)) % 2 === 0 ? BOARD.tile : BOARD.tileAlt}
        stroke={BOARD.stroke}
        strokeWidth={1}
      />
    ))}
  </svg>
);

export default CharacterStand;
