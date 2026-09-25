import React, { useState } from "react";
import { GroundCell, Island, Terrain } from "../../../types/message";
import { GroundSwatch } from "./GroundLayer";

interface IslandLegendProps {
  /** The island the fight is on, as the catalogue describes it. */
  island: Island | undefined;
  /** The island's ground as dealt on this board. */
  ground: GroundCell[];
  terrains: Map<string, Terrain>;
}

/**
 * What the island's ground does, in the corner of the board: every terrain
 * this fight was dealt, drawn the way the board draws it, with its one rule.
 * The same sentence shows on a cell's own card, but a player should not have
 * to go looking for a rule that is going to hit them at the end of the turn.
 * It folds away to its title, which is all a player who knows the island
 * needs.
 */
export const IslandLegend: React.FC<IslandLegendProps> = ({ island, ground, terrains }) => {
  const [open, setOpen] = useState(true);
  // In the order the island lists them, and only the ones actually laid.
  const laid = new Set(ground.map((cell) => cell.kind));
  const kinds = (island?.terrains ?? []).filter((kind) => laid.has(kind));
  if (!island || kinds.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-20 max-w-[240px] border-2 border-ink bg-paper/95 text-ink shadow-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 px-2 py-1 text-left"
      >
        <span className="font-display text-[12px] font-bold leading-tight">{island.name}</span>
        <span className="font-mono text-[9px] uppercase tracking-label text-muted">
          {open ? "Ground ▴" : `${kinds.length} terrain${kinds.length > 1 ? "s" : ""} ▾`}
        </span>
      </button>
      {open && (
        <ul className="border-t border-hairline px-2 py-1.5">
          {kinds.map((kind) => {
            const info = terrains.get(kind);
            return (
              <li key={kind} className="flex items-center gap-2 [&+&]:mt-1.5" data-legend={kind}>
                <GroundSwatch kind={kind} />
                <div className="min-w-0">
                  <div className="font-display text-[11px] font-bold leading-tight">{info?.name ?? kind}</div>
                  {info && <div className="font-sans text-[10px] leading-snug text-graphite">{info.rule}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
