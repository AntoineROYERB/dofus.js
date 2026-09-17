import React, { useEffect, useRef } from "react";
import { Position } from "../../../types/game";
import { TerrainCell, Zone } from "../../../types/message";
import { isoToScreen } from "../../../utils/isoUtils";

interface TerrainLayerProps {
  terrain: TerrainCell[];
  zones: Zone[];
  tileSize: { width: number; height: number };
  centerX: number;
  centerY: number;
  /** The element the board measures itself against; see SpellFXLayer. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Which side a relay or a trap belongs to decides its colour. */
  userId: string;
}

/*
 * The same pigments the spell effects use, so what a spell leaves behind looks
 * like the mark it made going off.
 */
const EMBER = "#e2521d";
const EMBER_HOT = "#ffb03a";
const INK = "#2f5fa8";
const INK_LIGHT = "#8fb4ea";
const SOIL = "#8a6a3a";
const SOIL_DARK = "#2a1d10";
const WIND = "#2e9e6a";
const ENEMY = "#a3231b";

const TAU = Math.PI * 2;

/** A stable pseudo-random number per cell, so a crack keeps its shape. */
const hash = (x: number, y: number, salt = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const reduced =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What spells have left on the board, drawn every frame from the server's
 * snapshot. The ground layer lies under the fighters — fire, water, ice,
 * cracks — and the top layer over them: smoke hides whoever stands in it,
 * and a storm's clouds hang above everyone.
 */
export const TerrainLayer: React.FC<TerrainLayerProps> = ({
  terrain,
  zones,
  tileSize,
  centerX,
  centerY,
  containerRef,
  userId,
}) => {
  const groundRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ terrain, zones, tileSize, centerX, centerY, userId });
  state.current = { terrain, zones, tileSize, centerX, centerY, userId };

  useEffect(() => {
    const ground = groundRef.current;
    const top = topRef.current;
    const container = containerRef.current;
    if (!ground || !top || !container) return;
    const g = ground.getContext("2d");
    const t = top.getContext("2d");
    if (!g || !t) return;

    let frame = 0;
    let running = true;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = container.clientWidth;
      const height = container.clientHeight;
      for (const [canvas, ctx] of [
        [ground, g],
        [top, t],
      ] as const) {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(container);

    const draw = (now: number) => {
      const s = state.current;
      const { width: tw, height: th } = s.tileSize;
      const w = container.clientWidth;
      const h = container.clientHeight;
      g.clearRect(0, 0, w, h);
      t.clearRect(0, 0, w, h);
      if (tw <= 0) return;
      const time = reduced ? 0 : now / 1000;
      const at = (p: Position) => isoToScreen(p.x, p.y, s.tileSize, s.centerX, s.centerY);

      const diamond = (ctx: CanvasRenderingContext2D, p: Position, scale = 1) => {
        const c = at(p);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - (th / 2) * scale);
        ctx.lineTo(c.x + (tw / 2) * scale, c.y);
        ctx.lineTo(c.x, c.y + (th / 2) * scale);
        ctx.lineTo(c.x - (tw / 2) * scale, c.y);
        ctx.closePath();
      };

      for (const zone of s.zones) {
        for (const cell of zone.cells) {
          diamond(g, cell, 0.96);
          g.fillStyle =
            zone.kind === "storm" ? "rgba(30,40,60,.16)" : "rgba(22,52,111,.16)";
          g.fill();
        }
      }

      for (const cell of s.terrain) {
        const { x, y } = cell.position;
        const c = at(cell.position);
        const mine = cell.owner === s.userId;
        switch (cell.kind) {
          case "fire": {
            diamond(g, cell.position, 0.92);
            g.fillStyle = "rgba(120,40,10,.26)";
            g.fill();
            for (let i = 0; i < 3; i++) {
              const fx = c.x + (i - 1) * tw * 0.16;
              const flick = Math.sin(time * 9 + x * 3 + y * 5 + i * 2);
              const fh = th * (0.55 + 0.18 * flick + 0.1 * hash(x, y, i));
              const fw = tw * 0.07;
              g.fillStyle = i === 1 ? EMBER_HOT : EMBER;
              g.globalAlpha = 0.9;
              g.beginPath();
              g.moveTo(fx - fw, c.y + th * 0.08);
              g.quadraticCurveTo(fx - fw * 0.6, c.y - fh * 0.6, fx + flick * fw * 0.3, c.y - fh);
              g.quadraticCurveTo(fx + fw * 0.6, c.y - fh * 0.5, fx + fw, c.y + th * 0.08);
              g.fill();
            }
            g.globalAlpha = 1;
            break;
          }
          case "water": {
            diamond(g, cell.position, 0.94);
            g.fillStyle = "rgba(47,95,168,.26)";
            g.fill();
            const r = ((time * 0.6 + hash(x, y)) % 1) * tw * 0.36;
            g.strokeStyle = `rgba(47,95,168,${0.55 * (1 - r / (tw * 0.36))})`;
            g.lineWidth = 1.2;
            g.beginPath();
            g.ellipse(c.x, c.y, r, r * (th / tw), 0, 0, TAU);
            g.stroke();
            if (!mine) {
              // Whose water it is matters: it heals one side and slows the other.
              g.fillStyle = ENEMY;
              g.globalAlpha = 0.5;
              g.beginPath();
              g.arc(c.x + tw * 0.28, c.y, 1.6, 0, TAU);
              g.fill();
              g.globalAlpha = 1;
            }
            break;
          }
          case "ice": {
            diamond(g, cell.position, 0.94);
            g.fillStyle = "rgba(205,228,255,.92)";
            g.fill();
            g.strokeStyle = "rgba(120,160,215,.9)";
            g.lineWidth = 1;
            g.stroke();
            g.strokeStyle = "#ffffff";
            g.lineWidth = 2;
            const glint = 0.5 + 0.5 * Math.sin(time * 2 + x + y);
            g.globalAlpha = 0.5 + 0.5 * glint;
            g.beginPath();
            g.moveTo(c.x - tw * 0.2, c.y - th * 0.02);
            g.lineTo(c.x - tw * 0.04, c.y - th * 0.2);
            g.moveTo(c.x + tw * 0.04, c.y + th * 0.16);
            g.lineTo(c.x + tw * 0.2, c.y);
            g.stroke();
            g.globalAlpha = 1;
            break;
          }
          case "crater": {
            g.fillStyle = SOIL;
            g.beginPath();
            g.ellipse(c.x, c.y, tw * 0.46, th * 0.44, 0, 0, TAU);
            g.fill();
            g.fillStyle = "#1c130c";
            g.beginPath();
            g.ellipse(c.x, c.y + th * 0.04, tw * 0.34, th * 0.3, 0, 0, TAU);
            g.fill();
            g.strokeStyle = "rgba(30,20,12,.7)";
            g.lineWidth = 1.5;
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU + hash(x, y, i);
              const len = 0.5 + 0.35 * hash(x, y, i + 9);
              g.beginPath();
              g.moveTo(c.x + Math.cos(a) * tw * 0.44, c.y + Math.sin(a) * th * 0.42);
              g.lineTo(c.x + Math.cos(a) * tw * len * 1.2, c.y + Math.sin(a) * th * len * 1.2);
              g.stroke();
            }
            break;
          }
          case "fissure": {
            diamond(g, cell.position, 0.9);
            g.fillStyle = "rgba(42,29,16,.3)";
            g.fill();
            const pts: [number, number][] = [];
            for (let i = 0; i <= 5; i++) {
              const u = i / 5;
              const wob = i === 0 || i === 5 ? 0 : (hash(x, y, i) - 0.5) * th * 0.5;
              pts.push([c.x - tw * 0.4 + u * tw * 0.8, c.y + wob]);
            }
            for (const [color, width] of [
              [SOIL_DARK, 5],
              ["#0e0804", 2],
            ] as const) {
              g.strokeStyle = color;
              g.lineWidth = width;
              g.beginPath();
              pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
              g.stroke();
            }
            break;
          }
          case "trap": {
            const bob = Math.sin(time * 2.4 + x + y) * th * 0.08;
            const r = tw * 0.16;
            t.strokeStyle = mine ? INK : ENEMY;
            t.lineWidth = 1.8;
            t.fillStyle = "rgba(47,95,168,.18)";
            t.beginPath();
            t.ellipse(c.x, c.y - th * 0.3 + bob, r, r * 0.95, 0, 0, TAU);
            t.fill();
            t.stroke();
            t.strokeStyle = "rgba(255,255,255,.95)";
            t.beginPath();
            t.arc(c.x - r * 0.35, c.y - th * 0.3 - r * 0.35 + bob, r * 0.35, 3.5, 4.6);
            t.stroke();
            break;
          }
          case "relay": {
            const color = mine ? WIND : ENEMY;
            diamond(g, cell.position, 0.9);
            g.fillStyle = mine ? "rgba(46,158,106,.14)" : "rgba(163,35,27,.1)";
            g.fill();
            for (let i = 0; i < 7; i++) {
              const rx = tw * (0.08 + i * 0.045);
              const yy = c.y - i * th * 0.18;
              const rot = time * 4 + i;
              t.strokeStyle = i % 2 ? "rgba(170,200,185,.9)" : color;
              t.lineWidth = 1.6;
              t.beginPath();
              t.ellipse(c.x + Math.sin(time * 3 + i) * 2, yy, rx, rx * 0.3, 0, rot, rot + 4.6);
              t.stroke();
            }
            break;
          }
          case "smoke": {
            for (let i = 0; i < 3; i++) {
              const drift = Math.sin(time * 0.7 + hash(x, y, i) * 6 + i) * tw * 0.08;
              t.fillStyle = i % 2 ? "rgba(150,144,135,.62)" : "rgba(128,121,112,.62)";
              t.beginPath();
              t.ellipse(
                c.x + (i - 1) * tw * 0.18 + drift,
                c.y - th * (0.35 + i * 0.28),
                tw * 0.3,
                th * 0.5,
                0,
                0,
                TAU
              );
              t.fill();
            }
            break;
          }
        }
      }

      for (const zone of s.zones) {
        const c = at(zone.center);
        if (zone.kind === "maelstrom") {
          const reach = tw * 1.15;
          for (let arm = 0; arm < 5; arm++) {
            g.strokeStyle = arm % 2 ? INK_LIGHT : INK;
            g.lineWidth = 2;
            g.beginPath();
            for (let r = reach; r > 3; r -= 3) {
              const a = (arm / 5) * TAU + r * (6 / tw) - time * 3;
              const px = c.x + Math.cos(a) * r;
              const py = c.y + Math.sin(a) * r * (th / tw);
              if (r === reach) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.stroke();
          }
          g.fillStyle = "rgba(5,13,34,.35)";
          g.beginPath();
          g.ellipse(c.x, c.y, tw * 0.16, th * 0.16, 0, 0, TAU);
          g.fill();
        } else {
          const cloudY = c.y - th * 4.2;
          for (let i = 0; i < 6; i++) {
            t.fillStyle = i % 2 ? "rgba(58,68,80,.8)" : "rgba(43,51,60,.8)";
            t.beginPath();
            t.ellipse(
              c.x + (i - 2.5) * tw * 0.42 + Math.sin(time * 0.5 + i) * 4,
              cloudY + Math.sin(i * 1.9) * th * 0.3,
              tw * 0.42,
              th * 0.55,
              0,
              0,
              TAU
            );
            t.fill();
          }
          // Rain, falling on the cells the storm covers.
          t.strokeStyle = "rgba(120,150,190,.55)";
          t.lineWidth = 1;
          for (let i = 0; i < 30; i++) {
            const cell = zone.cells[i % zone.cells.length];
            const p = at(cell);
            const fall = (time * 1.4 + hash(cell.x, cell.y, i)) % 1;
            const rx = p.x + (hash(i, cell.x, 3) - 0.5) * tw * 0.8;
            const ry = cloudY + (p.y - cloudY) * fall;
            t.beginPath();
            t.moveTo(rx, ry);
            t.lineTo(rx - 2, ry + th * 0.35);
            t.stroke();
          }
          // Now and then the cloud lights up from inside.
          if (!reduced && Math.sin(time * 2.3) > 0.97) {
            t.fillStyle = "rgba(220,235,255,.35)";
            t.beginPath();
            t.ellipse(c.x, cloudY, tw * 1.4, th * 0.9, 0, 0, TAU);
            t.fill();
          }
        }
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      const s = state.current;
      // Nothing on the board: one clear, then idle until something changes.
      if (!reduced && (s.terrain.length > 0 || s.zones.length > 0)) {
        frame = requestAnimationFrame(loop);
      } else {
        frame = 0;
      }
    };
    frame = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // Restarted whenever the board's contents change, so an idle board can
    // stop drawing without missing the next spell.
  }, [containerRef, terrain, zones, tileSize, centerX, centerY]);

  return (
    <>
      <canvas
        ref={groundRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
      <canvas
        ref={topRef}
        className="absolute inset-0 pointer-events-none z-[5]"
        aria-hidden="true"
      />
    </>
  );
};

export default TerrainLayer;
