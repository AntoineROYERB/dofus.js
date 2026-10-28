import React, { useEffect, useRef } from "react";

/*
 * The home screen's backdrop: a fountain at the heart of a dream, under a
 * night sky — after the Fountain of Dreams stages of the platform fighters,
 * in this game's own palette. It is world art, so it is painted the world's
 * way (docs/ART_DIRECTION.md, section 5): into a small canvas at art
 * resolution, scaled up by a whole number with no smoothing, every colour
 * from one short palette, stepped bands instead of gradients, and anything
 * seeded from its place in the scene rather than from the screen.
 *
 * Only water, glow and the two floating platforms move, at 30 frames a
 * second; under reduced motion one still frame is painted and nothing runs.
 */

const P = {
  sky: ["#070a1e", "#0d1234", "#161c4e", "#222a6a", "#2f2f7e", "#45358a"],
  star: "#eef1ff",
  starDim: "#8a97cc",
  moon: "#fff3cf",
  moonShade: "#e6cf9a",
  moonCrater: "#d9bd84",
  spireFar: "#1c2258",
  spireNear: "#262c6e",
  spireLight: "#3a4296",
  crystal: "#7cc8ea",
  crystalLight: "#cfeefa",
  outline: "#070a1e",
  stone: "#5b6cc0",
  stoneLight: "#8a9be0",
  stoneDark: "#38479a",
  water: "#4fa3ff",
  waterLight: "#9fd8ff",
  foam: "#eef1ff",
  pink: "#ff7ab6",
  gold: "#ffd76a",
  mist: "#3a4296",
  pmGrass: "#3fae5e",
  pmGrassLight: "#7ee08a",
} as const;

/** A number from 0 to 1 for a point of the scene: the same point, the same number. */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const paint = (ctx: CanvasRenderingContext2D, W: number, H: number, time: number) => {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  // The sky, in bands that step towards the horizon's violet.
  const horizon = Math.round(H * 0.62);
  P.sky.forEach((c, i) => {
    const y0 = Math.round((horizon * i) / P.sky.length);
    px(0, y0, W, Math.ceil(horizon / P.sky.length) + 1, c);
  });
  px(0, horizon, W, H - horizon, P.sky[1]);

  // Stars, each fixed to its place and twinkling on its own beat.
  for (let i = 0; i < Math.round((W * horizon) / 260); i++) {
    const x = Math.floor(hash(i, 1) * W);
    const y = Math.floor(hash(i, 2) * horizon * 0.95);
    const beat = Math.sin(time * (1 + hash(i, 3) * 2) + hash(i, 4) * 6.28);
    if (beat > 0.6 && hash(i, 5) > 0.7) {
      px(x - 1, y, 3, 1, P.star);
      px(x, y - 1, 1, 3, P.star);
    } else {
      px(x, y, 1, 1, beat > -0.2 ? P.star : P.starDim);
    }
  }

  // The moon, lit from the upper left like everything in the world.
  const mx = Math.round(W * 0.3);
  const my = Math.round(H * 0.24);
  const mr = Math.max(6, Math.round(H * 0.085));
  for (let y = -mr; y <= mr; y++) {
    for (let x = -mr; x <= mr; x++) {
      if (x * x + y * y > mr * mr) continue;
      const lit = x + y < mr * 0.4;
      px(mx + x, my + y, 1, 1, lit ? P.moon : P.moonShade);
    }
  }
  px(mx + Math.round(mr * 0.2), my - Math.round(mr * 0.3), 2, 2, P.moonCrater);
  px(mx - Math.round(mr * 0.4), my + Math.round(mr * 0.2), 3, 2, P.moonCrater);

  // Crystal spires along the horizon: a far row, then a nearer one.
  const spires = (count: number, base: number, tall: number, colour: string, row: number) => {
    for (let i = 0; i < count; i++) {
      const x = Math.round(((i + hash(i, row) * 0.6) / count) * W);
      const h = Math.round(tall * (0.45 + hash(i, row + 10) * 0.55));
      const w = Math.max(3, Math.round(h * 0.28));
      for (let y = 0; y < h; y++) {
        const half = Math.max(0, Math.round((w * (h - y)) / h / 2));
        px(x - half, base - y, half * 2 + 1, 1, colour);
      }
      // The lit edge, upper left.
      for (let y = Math.round(h * 0.2); y < h; y++) {
        const half = Math.max(0, Math.round((w * (h - y)) / h / 2));
        px(x - half, base - y, 1, 1, P.spireLight);
      }
    }
  };
  spires(Math.max(6, Math.round(W / 34)), horizon + 2, H * 0.22, P.spireFar, 20);
  spires(Math.max(4, Math.round(W / 60)), horizon + 6, H * 0.3, P.spireNear, 40);

  // The ground: a low terrace of dream stone across the bottom.
  px(0, horizon + 4, W, H, P.spireFar);
  for (let x = 0; x < W; x += 6) px(x + (Math.floor(x / 6) % 2) * 3, horizon + 8, 3, 1, P.spireNear);

  // Two floating islets, either side, each bobbing on its own slow beat:
  // a grassy top, a wedge of stone under it, and a crystal hanging below.
  const islet = (cx: number, cy: number, w: number, phase: number) => {
    const y = Math.round(cy + Math.sin(time * 0.8 + phase) * 3);
    const x = Math.round(cx - w / 2);
    const depth = Math.round(w * 0.35);
    for (let i = 0; i <= depth; i++) {
      const inset = Math.round((i / depth) * (w / 2 - 2));
      px(x + inset - 1, y + 3 + i, w - inset * 2 + 2, 1, P.outline);
      px(x + inset, y + 3 + i, w - inset * 2, 1, i < 2 ? P.stoneLight : i < depth * 0.6 ? P.stone : P.stoneDark);
    }
    px(x - 1, y - 1, w + 2, 5, P.outline);
    px(x, y, w, 3, P.pmGrass);
    px(x, y, w, 1, P.pmGrassLight);
    for (let i = 0; i < w; i += 5) px(x + i + Math.round(hash(i, cx) * 3), y - 1, 1, 1, P.pmGrassLight);
    const k = x + Math.round(w / 2);
    for (let i = 0; i < 7; i++) px(k - (6 - i) / 2, y + 4 + depth + i, 7 - i, 1, i < 2 ? P.crystalLight : P.crystal);
    if (Math.sin(time * 2 + phase) > 0.8) {
      px(k, y + 5 + depth, 1, 1, P.foam);
      px(k - 1, y + 6 + depth, 3, 1, P.crystalLight);
    }
  };
  islet(W * 0.25, H * 0.4, Math.round(W * 0.11), 0);
  islet(W * 0.75, H * 0.36, Math.round(W * 0.11), 2.1);

  // The fountain, behind the fighter: a wide basin and a tall spout.
  const cx = Math.round(W / 2);
  const basinY = Math.round(H * 0.74);
  const basinW = Math.round(W * 0.46);
  const bx = cx - Math.round(basinW / 2);
  px(bx - 2, basinY - 2, basinW + 4, 12, P.outline);
  px(bx, basinY, basinW, 2, P.stoneLight);
  px(bx, basinY + 2, basinW, 8, P.stone);
  px(bx, basinY + 8, basinW, 2, P.stoneDark);
  // Its water, a highlight crossing it as the surface moves.
  px(bx + 3, basinY - 1, basinW - 6, 2, P.water);
  const glint = Math.round(((time * 18) % (basinW + 30)) - 15);
  for (let i = 0; i < 10; i++) {
    const gx = bx + glint + i * 3;
    if (gx > bx + 3 && gx < bx + basinW - 4) px(gx, basinY - 1, 2, 1, P.waterLight);
  }
  // The spout: a column, a bowl, and the water thrown up from it.
  const spoutTop = Math.round(H * 0.26);
  px(cx - 3, spoutTop + 8, 6, basinY - spoutTop - 8, P.outline);
  px(cx - 2, spoutTop + 8, 4, basinY - spoutTop - 8, P.stone);
  px(cx - 2, spoutTop + 8, 1, basinY - spoutTop - 8, P.stoneLight);
  const bowlW = Math.round(W * 0.17);
  // The bowl: a shallow cup, wider at its lip, its water brimming.
  for (let i = 0; i < 5; i++) {
    const half = Math.round(bowlW / 2 - i * 2);
    px(cx - half - 1, spoutTop + 4 + i, half * 2 + 2, 1, P.outline);
    px(cx - half, spoutTop + 4 + i, half * 2, 1, i === 0 ? P.stoneLight : i < 3 ? P.stone : P.stoneDark);
  }
  px(cx - bowlW / 2 + 2, spoutTop + 3, bowlW - 4, 1, P.water);

  // Jets: droplets on arcs, left and right, falling into the basin.
  const jet = (dir: number, offset: number) => {
    const drops = 30;
    const reach = basinW * 0.46;
    const rise = H * 0.12;
    for (let i = 0; i < drops; i++) {
      const t = (time * 0.45 + i / drops + offset) % 1;
      const x = cx + dir * t * reach;
      const fall = basinY - spoutTop - 4;
      const y = spoutTop + 3 - rise * 4 * t * (1 - t) + fall * t * t;
      // Leaving the bowl's lip, so the arcs clear the fighter in front.
      const lx = x + dir * (bowlW / 2 - 2) * (1 - t);
      px(lx, y, 2, 2, t < 0.12 ? P.foam : i % 3 === 0 ? P.waterLight : P.water);
    }
  };
  jet(-1, 0);
  jet(1, 0.5);
  jet(-1, 0.25);
  jet(1, 0.75);
  // The column of water straight up, flickering at its crest.
  const crest = Math.round(Math.sin(time * 3) * 2);
  px(cx - 1, spoutTop - 16 + crest, 3, 20 - crest, P.waterLight);
  px(cx, spoutTop - 16 + crest, 1, 20 - crest, P.foam);
  px(cx - 2, spoutTop - 18 + crest, 5, 2, P.foam);

  // Sparkles rising off the water, in the dream's three lights.
  const lights = [P.pink, P.gold, P.crystalLight];
  for (let i = 0; i < 26; i++) {
    const t = (time * (0.08 + hash(i, 7) * 0.08) + hash(i, 8)) % 1;
    const x = cx + (hash(i, 9) - 0.5) * basinW * 0.9 + Math.sin(time + i) * 3;
    const y = basinY - t * H * 0.55;
    if (t > 0.92) continue;
    const c = lights[i % 3];
    if (Math.sin(time * 4 + i) > 0.5) {
      px(x - 1, y, 3, 1, c);
      px(x, y - 1, 1, 3, c);
    } else {
      px(x, y, 1, 1, c);
    }
  }

  // Mist drifting along the foot of the scene.
  for (let i = 0; i < 7; i++) {
    const w = Math.round(W * 0.22);
    const x = Math.round((((time * 6 + i * (W / 3.5)) % (W + w)) - w));
    const y = Math.round(H * 0.86 + hash(i, 11) * H * 0.08);
    px(x, y, w, 2, P.mist);
    px(x + 4, y - 1, w - 8, 1, P.mist);
  }
};

export const DreamFountain: React.FC<{ className?: string }> = ({ className = "" }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A whole-number scale: ×2 on a phone, ×3 on a large screen.
    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = rect.height > 600 ? 3 : 2;
      canvas.width = Math.max(1, Math.ceil(rect.width / scale));
      canvas.height = Math.max(1, Math.ceil(rect.height / scale));
      ctx.imageSmoothingEnabled = false;
    };
    size();
    const observer = new ResizeObserver(() => {
      size();
      if (still) paint(ctx, canvas.width, canvas.height, 0);
    });
    observer.observe(canvas);

    if (still) {
      paint(ctx, canvas.width, canvas.height, 0);
      return () => observer.disconnect();
    }

    let frame = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Water and glow at 30 frames a second, as the charter has them.
      if (now - last < 1000 / 30 || document.hidden) return;
      last = now;
      paint(ctx, canvas.width, canvas.height, (now - start) / 1000);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none h-full w-full [image-rendering:pixelated] ${className}`}
    />
  );
};

export default DreamFountain;
