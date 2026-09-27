import React from "react";
import { Spell } from "../../types/message";
import { strikeOf } from "../../utils/attacks";
import { elementLook } from "../../utils/elements";
import { BOARD } from "../../constants";

/*
 * What an outfit's attack does, at a glance: a strip of the board from the
 * fighter to where it strikes, the cells it hits in its element's colour,
 * and the handful of facts that set it apart from the others.
 */

const CELL_W = 16;
const CELL_H = 10;
const INK = BOARD.ink;
const RULE = BOARD.stroke;

const project = (x: number, y: number) => ({
  sx: (x - y) * (CELL_W / 2),
  sy: (x + y) * (CELL_H / 2),
});
const diamond = `${CELL_W / 2},0 ${CELL_W},${CELL_H / 2} ${CELL_W / 2},${CELL_H} 0,${CELL_H / 2}`;

/** The attack's shape: you, the way to the target, and the cells it hits. */
export const AttackShape: React.FC<{ spell: Spell }> = ({ spell }) => {
  const look = elementLook(spell.element);
  const colour = look?.color ?? INK;
  const { self, reach, cells } = strikeOf(spell);
  const path = Array.from({ length: Math.max(0, reach - 1) }, (_, i) => ({
    x: 0,
    y: i + 1,
  }));
  const push = spell.push ?? 0;
  const all = [
    { x: 0, y: 0 },
    ...path,
    ...cells,
    ...(push ? [{ x: 0, y: reach + push }] : []),
  ];
  const pts = all.map((c) => project(c.x, c.y));
  const minX = Math.min(...pts.map((p) => p.sx)) - CELL_W / 2 - 2;
  const maxX = Math.max(...pts.map((p) => p.sx)) + CELL_W / 2 + 2;
  const minY = Math.min(...pts.map((p) => p.sy)) - CELL_H / 2 - 2;
  const maxY = Math.max(...pts.map((p) => p.sy)) + CELL_H / 2 + 2;
  const cell = (
    x: number,
    y: number,
    props: React.SVGProps<SVGPolygonElement>,
    key: string,
  ) => {
    const { sx, sy } = project(x, y);
    return (
      <polygon
        key={key}
        points={diamond}
        transform={`translate(${sx - CELL_W / 2}, ${sy - CELL_H / 2})`}
        {...props}
      />
    );
  };
  const target = project(0, reach);
  const thrown = project(0, reach + push);
  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      width={maxX - minX}
      height={maxY - minY}
      className="flex-none"
      aria-hidden
    >
      {path.map((c, i) =>
        cell(c.x, c.y, { fill: "none", stroke: RULE, strokeWidth: 1 }, `p${i}`),
      )}
      {cells.map((c, i) =>
        cell(
          c.x,
          c.y,
          {
            fill: colour,
            fillOpacity: c.x === 0 && c.y === reach && !self ? 0.9 : 0.55,
            stroke: colour,
            strokeWidth: 0.8,
          },
          `h${i}`,
        ),
      )}
      {/* You: an ink cell, ringed when the attack goes all round you. */}
      {cell(
        0,
        0,
        self
          ? { fill: BOARD.tile, stroke: INK, strokeWidth: 1.4 }
          : { fill: INK, fillOpacity: 0.85 },
        "you",
      )}
      {push !== 0 && (
        <line
          x1={target.sx}
          y1={target.sy}
          x2={thrown.sx}
          y2={thrown.sy}
          stroke={INK}
          strokeWidth={1.4}
          markerEnd="url(#attack-arrow)"
        />
      )}
      <defs>
        <marker
          id="attack-arrow"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill={INK} />
        </marker>
      </defs>
    </svg>
  );
};

export default AttackShape;
