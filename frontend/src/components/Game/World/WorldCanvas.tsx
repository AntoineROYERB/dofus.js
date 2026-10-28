import React, { useContext, useEffect, useRef, useState } from "react";
import { Position } from "../../../types/game";
import { ContentResponse, GameState } from "../../../types/message";
import { WebSocketContext } from "../../../context/WebSocketContext";
import { Light, Rgb } from "../../../world/ascii";
import { Backdrop, paintBackdrop, paintForeground } from "../../../world/backdrop";
import { Frame, wallFoot } from "../../../world/compose";
import { Direction } from "../../../world/figures";
import { planScene, Layout } from "../../../world/layout";
import { newStillLayers, paintStill, StillLayers } from "../../../world/paint";
import { Air, lookOfMote, newAir, stepAir } from "../../../world/particles";
import { Layer, WORLD, hex } from "../../../world/raster";
import { sceneSeed } from "../../../world/seed";
import { Rect, stampFigure, union } from "../../../world/stamp";
import { boardToArt, cellToArt, glyphGrid, RISE } from "../../../world/view";
import { createRenderer, Overlay, Renderer } from "./renderer";
import { frameOf, Pose } from "./fighters";
import { FrameMeter } from "./FrameMeter";
import { meterEnabled } from "./meter";

/**
 * The fight, drawn as a living ASCII world that fills the screen.
 *
 * One canvas, fixed over the whole viewport and under every control. The
 * board's DOM (marks, rings, numbers, the cells a tap lands on) stays where
 * it is, laid over this; the canvas reads the same tile size, pan and scale,
 * so cell (x, y) is drawn exactly where its DOM tile sits.
 *
 * The still scene (land, backdrop, scenery) is painted once per fight; every
 * frame only the fighters are stamped, the air moved, and the two passes
 * run (renderer.ts).
 */

export type FighterView = {
  /** A figure by name, bypassing the outfit's: the preview page's way in. */
  figure?: string;
  play?: Pose["play"];
  screenPosition: Position;
  direction: Direction;
  animation: "idle" | "walk" | "attack" | "die";
  opacity?: number;
  outfit?: string;
  creature?: string;
  attack?: "melee" | "ranged" | "none";
};

type Props = {
  /** The board's container: the scene is laid out from its box. */
  containerRef: React.RefObject<HTMLDivElement>;
  tile: number;
  scale: number;
  pan: Position;
  gameState: GameState | null | undefined;
  content: ContentResponse | null | undefined;
  fighters: Record<string, FighterView>;
};

type Scene = {
  key: string;
  layout: Layout;
  still: StillLayers;
  backdrop: Backdrop;
  palette: ContentResponse["palettes"][string];
  look: string;
  air: Air;
  lights: Light[];
};

export const WorldCanvas: React.FC<Props> = ({ containerRef, tile, scale, pan, gameState, content, fighters }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomId = useContext(WebSocketContext)?.roomId ?? "";
  const [kind, setKind] = useState<string>("");
  const [force2d, setForce2d] = useState(false);

  // Everything the frame loop reads, refreshed on every render without
  // restarting it.
  const live = useRef({ tile, scale, pan, fighters });
  live.current = { tile, scale, pan, fighters };

  const island = content?.islands.find((i) => i.id === gameState?.island);
  const paletteId = island?.palette ?? "prairie";
  // Every server message is a fresh snapshot, so the deal and the cover are
  // compared by what they hold: repainting the scene on every message would
  // cost a frame each time.
  const groundKey = JSON.stringify(gameState?.ground ?? []);
  const obstaclesKey = JSON.stringify(gameState?.obstacles ?? []);
  const ground = React.useMemo(() => JSON.parse(groundKey) as NonNullable<GameState["ground"]>, [groundKey]);
  const obstacles = React.useMemo(() => JSON.parse(obstaclesKey) as Position[], [obstaclesKey]);
  const seed = React.useMemo(() => sceneSeed(gameState?.island, roomId, ground), [gameState?.island, roomId, ground]);

  // The still scene: rebuilt only when the island, the deal or the cover change.
  const sceneRef = useRef<Scene | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  useEffect(() => {
    const palette = content?.palettes[paletteId] ?? (content ? Object.values(content.palettes)[0] : undefined);
    if (!palette || !content) return;
    const layout = planScene(paletteId, seed);
    const still = sceneRef.current?.still ?? newStillLayers();
    paintStill(still, { layout, palette, palettes: content.palettes, ground: ground ?? [], obstacles: obstacles ?? [], seed });
    const backdrop = paintBackdrop(paletteId, palette, seed);
    const flowers = palette.flowers.map(hex);
    const leaves = palette.leaves.map(hex);
    const liquid = palette.liquid.map(hex);
    const colors: Record<string, Rgb> = {
      firefly: [210, 240, 120],
      dust: hex(palette.path),
      drizzle: liquid[3],
      snow: [240, 246, 255],
      petal: flowers[1],
      spore: flowers[1],
      ember: hex(palette.accent),
      leaf: leaves[2],
    };
    const trees = layout.decor
      .filter((d) => d.kind === "tree")
      .map((d) => {
        const a = cellToArt(d.cell.x, d.cell.y);
        return { x: a.x, y: a.y - layout.levelOf(d.cell) * RISE };
      });
    // Still light: liquids that glow, in the ponds and on the board.
    const lights: Light[] = [];
    if (layout.look.liquid === "lava" || layout.look.liquid === "acid") {
      for (const p of layout.ponds) lights.push({ x: p.centre.x, y: p.centre.y + 14, radius: 70, strength: 0.8, color: liquid[3] });
    }
    for (const g of ground ?? []) {
      if (g.kind !== "lava" && g.kind !== "acid_pool") continue;
      const a = cellToArt(g.position.x, g.position.y);
      const col = (content.palettes[g.kind === "lava" ? "fire" : "acid"] ?? palette).liquid.map(hex)[3];
      lights.push({ x: a.x, y: a.y, radius: 26, strength: 0.6, color: col });
    }
    sceneRef.current = {
      key: `${paletteId}:${seed}`,
      layout,
      still,
      backdrop,
      palette,
      look: paletteId,
      air: newAir(layout.look, seed, colors as Air["colors"], trees),
      lights,
    };
    // In development, the scene is reachable from the console for checks.
    if (import.meta.env.DEV) (window as unknown as { __asciiScene?: unknown }).__asciiScene = { ...sceneRef.current, obstacles, ground };
    setSceneVersion((v) => v + 1);
  }, [content, paletteId, seed, ground, obstacles]);

  // The frame loop.
  const meter = useRef<FrameMeter | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    const prefer2d = force2d || new URLSearchParams(window.location.search).get("ascii") === "2d";
    const made = createRenderer(canvas, prefer2d);
    if (!made) {
      // This canvas spent its context on a failed WebGL2: a fresh one draws in 2D.
      if (!force2d) setForce2d(true);
      return;
    }
    const renderer: Renderer = made;
    setKind(renderer.kind);
    renderer.setStill(scene.still, scene.backdrop);
    const dyn = new Layer(WORLD.w, WORLD.h, WORLD.x0, WORLD.y0);
    let lastRect: Rect | null = null;
    let fore: Layer | null = null;
    let foreWidth = 0;
    let overlay: Overlay = { data: new Uint8Array(4), cols: 1, rows: 1 };
    const began = new Map<string, { anim: string; at: number }>();
    const start = performance.now();
    let last = start;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const container = containerRef.current;
      if (!container || document.hidden) return;
      const work = performance.now();
      const t = (now - start) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { tile, scale, pan, fighters } = live.current;
      const rect = container.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      // The board's centre on the viewport, the zoom layer's pan included.
      const centre = { x: rect.left + rect.width / 2 + pan.x, y: rect.top + rect.height / 2 + pan.y };
      const grid = glyphGrid({ width: vw, height: vh, dpr, tile, scale, pan: { x: centre.x - vw / 2, y: centre.y - vh / 2 } });
      grid.cols += 1;
      grid.rows += 1;
      const view = {
        left: grid.left,
        top: grid.top,
        right: grid.left + vw / grid.unit,
        bottom: grid.top + vh / grid.unit,
      };

      // The foreground is laid against the frame: repaint it when the frame's width changes.
      const widthArt = view.right - view.left;
      if (!fore || Math.abs(widthArt - foreWidth) > 4) {
        foreWidth = widthArt;
        fore = paintForeground(widthArt, scene.palette, scene.layout.decor.length);
        renderer.setFore(fore);
      }

      // Fighters, back to front.
      if (lastRect) dyn.clearRect(lastRect.x, lastRect.y, lastRect.w, lastRect.h);
      let touched: Rect | null = null;
      const glows: Light[] = [];
      const order = Object.entries(fighters).sort(([, a], [, b]) => a.screenPosition.y - b.screenPosition.y);
      for (const [id, f] of order) {
        const b = began.get(id);
        if (!b || b.anim !== f.animation) began.set(id, { anim: f.animation, at: t });
        const since = t - (began.get(id)?.at ?? t);
        const pose: Pose = { figure: f.figure, play: f.play, outfit: f.outfit, creature: f.creature, animation: f.animation, attack: f.attack, direction: f.direction, time: f.animation === "idle" ? t + id.length : since };
        const fr = frameOf(pose);
        if (!fr) continue;
        const feet = boardToArt(f.screenPosition, { width: rect.width, height: rect.height, tile });
        const opacity = f.opacity ?? 1;
        const { rect: r, glow } = stampFigure(dyn, fr, feet.x, feet.y, {
          opacity,
          breath: f.animation === "idle" ? Math.floor(t * 1.4 + id.length) % 2 : 0,
          sink: f.animation === "die" ? (1 - opacity) * 6 : 0,
        });
        touched = union(touched, r);
        if (glow) glows.push({ x: glow.x, y: glow.y, radius: 34, strength: 0.75, color: glow.color });
      }
      renderer.setDyn(dyn, union(touched, lastRect));
      lastRect = touched;

      // Light: the backdrop's sources stand on its foot, wherever that is now.
      const lights: Light[] = [...glows, ...scene.lights];
      for (const l of scene.backdrop.lights) {
        const flicker = 1 - l.flicker * 0.12 * (0.5 + 0.5 * Math.sin(t * 9 + l.u));
        lights.push({ x: l.u, y: wallFoot(l.u, view.top) - l.v, radius: l.radius, strength: l.strength * flicker, color: l.color });
      }
      lights.sort((a, b) => b.strength - a.strength);

      // The air, written straight into the cells it passes.
      stepAir(scene.air, dt, t, view);
      const cells = grid.cols * grid.rows;
      if (overlay.cols !== grid.cols || overlay.rows !== grid.rows) overlay = { data: new Uint8Array(cells * 4), cols: grid.cols, rows: grid.rows };
      else overlay.data.fill(0);
      for (const m of scene.air.motes) {
        const look = lookOfMote(scene.air, m, t);
        if (!look) continue;
        const col = Math.floor((m.x - grid.left) / grid.stepX);
        const row = Math.floor((m.y - grid.top) / grid.stepY);
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        const o = (row * grid.cols + col) * 4;
        overlay.data[o] = look.color[0];
        overlay.data[o + 1] = look.color[1];
        overlay.data[o + 2] = look.color[2];
        overlay.data[o + 3] = look.glyph + 1;
      }

      const fr: Frame = {
        still: scene.still,
        dyn,
        backdrop: scene.backdrop,
        fore: fore!,
        look: scene.look,
        ambient: scene.layout.look.ambientLight,
        lights,
        view,
        time: t,
      };
      renderer.draw({ grid, frame: fr, overlay, tick: Math.floor(t * 6) });
      const c = canvas;
      const cssW = `${(grid.cols * grid.gw) / dpr}px`;
      if (c.style.width !== cssW) {
        c.style.width = cssW;
        c.style.height = `${(grid.rows * grid.gh) / dpr}px`;
      }
      meter.current?.record(now, performance.now() - work);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
    // The loop reads everything else through `live`; it restarts only for a new scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneVersion, force2d]);

  return (
    <>
      <canvas
        key={force2d ? "2d" : "gl"}
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0"
        style={{ imageRendering: "pixelated" }}
        data-renderer={kind}
      />
      {meterEnabled() && <FrameMeter ref={meter} renderer={kind} />}
    </>
  );
};
