import React from "react";
import { GroundCell } from "../../../types/message";
import { isoToScreen } from "../../../utils/isoUtils";
import { diamondCorners } from "../../../utils/tearSides";

interface GroundLayerProps {
  ground: GroundCell[];
  tileSize: { width: number; height: number };
  centerX: number;
  centerY: number;
}

/*
 * The island's own ground, washed onto the paper under everything else. It is
 * there from the first turn and never changes, so it is drawn quietly — a
 * wash and a few marks per cell — and leaves the loud colours to what spells
 * do on top of it. What each kind does is said on the cell's card, from the
 * catalogue; the look only has to tell the kinds apart at a glance.
 */
const LOOK: Record<string, { wash: string; ink: string; opacity: number }> = {
  tall_grass: { wash: "#7fae5a", ink: "#3f6e34", opacity: 0.42 },
  rock: { wash: "#8a857c", ink: "#3d3a35", opacity: 0.85 },
  shallow_water: { wash: "#6fa8d6", ink: "#2f5fa8", opacity: 0.4 },
  ice: { wash: "#cfe3f6", ink: "#6f94c8", opacity: 0.7 },
  acid_pool: { wash: "#8fd14a", ink: "#3f7a1e", opacity: 0.45 },
  lava: { wash: "#e2521d", ink: "#8a1e10", opacity: 0.8 },
  air_current: { wash: "#cfe8dc", ink: "#2e9e6a", opacity: 0.45 },
};

/** A stable pseudo-random number per cell, so marks keep their place. */
const hash = (x: number, y: number, salt = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const points = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

const Marks: React.FC<{
  cell: GroundCell;
  cx: number;
  cy: number;
  w: number;
  h: number;
  ink: string;
}> = ({ cell, cx, cy, w, h, ink }) => {
  const { x, y } = cell.position;
  const spot = (salt: number) => ({
    x: cx + (hash(x, y, salt) - 0.5) * w * 0.45,
    y: cy + (hash(x, y, salt + 1) - 0.5) * h * 0.4,
  });
  switch (cell.kind) {
    case "tall_grass":
      return (
        <g stroke={ink} strokeWidth={1.4} strokeLinecap="round" fill="none">
          {[0, 1, 2, 3, 4].map((k) => {
            const s = spot(k * 3);
            const r = h * 0.28;
            return (
              <path
                key={k}
                d={`M${s.x - 3},${s.y} q-1,${-r * 0.7} -3,${-r} M${s.x},${s.y} q0,${-r} 1,${-r * 1.3} M${s.x + 3},${s.y} q1,${-r * 0.7} 3,${-r}`}
              />
            );
          })}
        </g>
      );
    case "rock": {
      // A block standing up off the paper: its top a lighter diamond.
      const lift = h * 0.45;
      const top = diamondCorners({ x: cx, y: cy - lift }, { width: w * 0.7, height: h * 0.7 });
      const base = diamondCorners({ x: cx, y: cy }, { width: w * 0.7, height: h * 0.7 });
      return (
        <g stroke={ink} strokeWidth={1.2} strokeLinejoin="round">
          <polygon points={points([base[3], base[2], top[2], top[3]])} fill="#6d6860" />
          <polygon points={points([base[2], base[1], top[1], top[2]])} fill="#57534c" />
          <polygon points={points(top)} fill="#a7a197" />
        </g>
      );
    }
    case "shallow_water":
      return (
        <g stroke={ink} strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.8}>
          {[0, 1].map((k) => {
            const s = spot(k * 5 + 11);
            return <path key={k} d={`M${s.x - 7},${s.y} q3.5,-3 7,0 t7,0`} />;
          })}
        </g>
      );
    case "ice":
      return (
        <g stroke="#ffffff" strokeWidth={2} strokeLinecap="round" opacity={0.9}>
          <line x1={cx - w * 0.12} y1={cy + h * 0.08} x2={cx + w * 0.04} y2={cy - h * 0.12} />
          <line x1={cx + w * 0.02} y1={cy + h * 0.16} x2={cx + w * 0.12} y2={cy + h * 0.02} />
        </g>
      );
    case "acid_pool":
      return (
        <g stroke={ink} strokeWidth={1.1} fill="#c4f26a">
          {[0, 1, 2].map((k) => {
            const s = spot(k * 7 + 21);
            return <circle key={k} cx={s.x} cy={s.y} r={1.8 + hash(x, y, k) * 2} />;
          })}
        </g>
      );
    case "lava":
      return (
        <g stroke="#ffc04a" strokeWidth={1.4} strokeLinecap="round" fill="none">
          <path d={`M${cx - w * 0.18},${cy} l${w * 0.1},${-h * 0.08} l${w * 0.08},${h * 0.1} l${w * 0.1},${-h * 0.06}`} />
        </g>
      );
    case "air_current": {
      if (!cell.wind) return null;
      // The wind's own direction, projected like the board.
      const to = isoToScreen(cell.wind.x, cell.wind.y, { width: w, height: h }, 0, 0);
      const len = Math.hypot(to.x, to.y) || 1;
      const ux = to.x / len;
      const uy = to.y / len;
      const r = w * 0.2;
      const tip = { x: cx + ux * r, y: cy + uy * r };
      const tail = { x: cx - ux * r, y: cy - uy * r };
      const side = { x: -uy * 4, y: ux * 4 };
      return (
        <g stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} strokeDasharray="4 3" />
          <polyline
            points={points([
              { x: tip.x - ux * 6 + side.x, y: tip.y - uy * 6 + side.y },
              tip,
              { x: tip.x - ux * 6 - side.x, y: tip.y - uy * 6 - side.y },
            ])}
          />
        </g>
      );
    }
  }
  return null;
};

/** One terrain drawn on a single small cell, for a legend. */
export const GroundSwatch: React.FC<{ kind: string; size?: number }> = ({ kind, size = 34 }) => {
  const look = LOOK[kind];
  if (!look) return null;
  const w = size;
  const h = size / 2;
  // Room above the cell for what stands up off it: rock, grass.
  const top = h * 0.7;
  const cell: GroundCell = { position: { x: 0, y: 0 }, kind, wind: kind === "air_current" ? { x: 1, y: 0 } : undefined };
  return (
    <svg width={w} height={h + top} viewBox={`0 ${-top} ${w} ${h + top}`} aria-hidden="true" className="flex-none">
      <polygon
        points={points(diamondCorners({ x: w / 2, y: h / 2 }, { width: w, height: h }))}
        fill={look.wash}
        opacity={Math.max(look.opacity, 0.55)}
        stroke="#1b201c"
        strokeOpacity={0.25}
      />
      <Marks cell={cell} cx={w / 2} cy={h / 2} w={w} h={h} ink={look.ink} />
    </svg>
  );
};

export const GroundLayer: React.FC<GroundLayerProps> = ({ ground, tileSize, centerX, centerY }) => {
  if (ground.length === 0) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      {ground.map((cell) => {
        const look = LOOK[cell.kind];
        if (!look) return null;
        const { x, y } = isoToScreen(cell.position.x, cell.position.y, tileSize, centerX, centerY);
        return (
          <g key={`${cell.position.x},${cell.position.y}`} data-ground={cell.kind}>
            <polygon
              points={points(diamondCorners({ x, y }, { width: tileSize.width * 0.94, height: tileSize.height * 0.94 }))}
              fill={look.wash}
              opacity={look.opacity}
            />
            <Marks cell={cell} cx={x} cy={y} w={tileSize.width} h={tileSize.height} ink={look.ink} />
          </g>
        );
      })}
    </svg>
  );
};
