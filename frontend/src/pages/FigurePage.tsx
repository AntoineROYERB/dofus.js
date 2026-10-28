import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GameState } from "../types/message";
import { useContent } from "../hooks/useContent";
import { useTileSize } from "../hooks/useTileSize";
import { isoToScreen } from "../utils/isoUtils";
import { WorldCanvas, FighterView } from "../components/Game/World/WorldCanvas";
import { forgetFigure } from "../components/Game/World/fighters";
import { ANIMATIONS, Direction } from "../world/figures";
import { t } from "../i18n/lang";

/**
 * `/figures?figure=<name>`: a figure seen the way a fight will show it, in
 * ASCII, on each island's ground and in its wind. One fighter in the middle
 * plays the chosen animation; eight around it face the eight directions.
 * The sheet is read again whenever the file changes, so a figure can be
 * drawn in a pixel editor with this page open beside it.
 */

const AROUND: [number, number, Direction][] = [
  [-5, -5, "N"],
  [-3, -6, "NE"],
  [-1, -6, "E"],
  [6, 2, "SE"],
  [5, 5, "S"],
  [2, 6, "SW"],
  [-6, 3, "W"],
  [-6, -2, "NW"],
];

/** How the preview names each animation for the game's poses. */
const POSE: Record<(typeof ANIMATIONS)[number], { animation: FighterView["animation"]; attack?: FighterView["attack"] }> = {
  idle: { animation: "idle" },
  walk: { animation: "walk" },
  melee: { animation: "attack", attack: "melee" },
  ranged: { animation: "attack", attack: "ranged" },
  hit: { animation: "idle" },
  fall: { animation: "die" },
};

const FigurePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const name = params.get("figure") ?? "pyromancer";
  const island = params.get("island") ?? "prairie";
  const anim = (params.get("anim") ?? "idle") as (typeof ANIMATIONS)[number];
  const { content } = useContent();
  const containerRef = useRef<HTMLDivElement>(null);
  const { tile, size } = useTileSize(containerRef, 15);
  const [, setVersion] = useState(0);

  // Watch the sheet: a new save in the editor shows here within a second.
  useEffect(() => {
    let last = "";
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/figures/${name}.png`, { method: "HEAD", cache: "no-store" });
        const stamp = `${r.headers.get("last-modified")}|${r.headers.get("etag")}|${r.headers.get("content-length")}`;
        if (last && stamp !== last) {
          forgetFigure(name);
          setVersion((v) => v + 1);
        }
        last = stamp;
      } catch {
        // The dev server restarting is not worth a message.
      }
    }, 1000);
    return () => clearInterval(id);
  }, [name]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const terrains = content?.islands.find((i) => i.id === island)?.terrains ?? [];
  const state = {
    island,
    ground: terrains.flatMap((kind, k) => [
      { position: { x: 4 + k, y: -1 }, kind, wind: { x: 1, y: 0 } },
      { position: { x: -4, y: 2 - k }, kind, wind: { x: 0, y: 1 } },
    ]),
    obstacles: [{ x: 1, y: -4 }],
  } as unknown as GameState;

  const centre = { x: size.width / 2, y: size.height / 2 };
  const at = (x: number, y: number) => isoToScreen(x, y, tile, centre.x, centre.y);
  const fighters: Record<string, FighterView> = {
    middle: { figure: name, play: anim, screenPosition: at(0, 0), direction: "S", ...POSE[anim] },
  };
  AROUND.forEach(([x, y, direction]) => {
    fighters[direction] = { figure: name, play: anim, screenPosition: at(x, y), direction, ...POSE[anim] };
  });

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${active ? "border-gold bg-gold text-night" : "border-gold/40 bg-panel/90 text-ink"}`;

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper text-ink">
      <div ref={containerRef} className="absolute inset-0">
        <WorldCanvas containerRef={containerRef} tile={tile.width} scale={1} pan={{ x: 0, y: 0 }} gameState={state} content={content} fighters={fighters} />
      </div>
      <div className="absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1.5">
        <span className="font-display text-[14px] font-bold">{t("Figure: {name}", { name })}</span>
        {(content?.islands ?? []).map((i) => (
          <button key={i.id} type="button" className={chip(i.id === island)} onClick={() => set("island", i.id)}>
            {i.name}
          </button>
        ))}
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
        {ANIMATIONS.map((a) => (
          <button key={a} type="button" className={chip(a === anim)} onClick={() => set("anim", a)}>
            {t(a)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FigurePage;
