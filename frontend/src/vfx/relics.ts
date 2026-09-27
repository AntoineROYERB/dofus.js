/*
 * The talismans, drawn as shards of whoever they came from: Ashka's heart,
 * Sef's feather, Mother Brine's conch and Old Grund's stone, then a piece of
 * each legendary — the Ashen King's halo, a crystal of Aurorion's wing, one
 * of the orbs that circle Fulgor, Sahr'Khan's coil.
 *
 * On the fighters' own grid: one pixel of a shard is a 64th of a cell, the
 * same as a pixel of their sprites, in colours taken from those sprites. A
 * shard whose ultimate is ready glows in a soft dithered halo and stirs with
 * its element; one still charging is grey and still.
 */

type Stir = "embers" | "wind" | "bubbles" | "dust" | "frost" | "sparks" | "sand";

interface Shard {
  rows: string[];
  palette: Record<string, string>;
  /** The letters that breathe light. */
  glowing: string;
  halo: string;
  stir: Stir;
}

const SHARDS: Record<string, Shard> = {
  "ashkas-heart": {
    rows: [
      ".oo...oo.",
      "oKho.oKKo",
      "oKhKoKKko",
      "oKKdKKdko",
      "oKdOddKko",
      ".okKdOko.",
      "..okdko..",
      "...oko...",
      "....o....",
    ],
    palette: { o: "#0f0c0b", k: "#26211e", K: "#3a332e", h: "#4a403a", d: "#ef9f27", O: "#fac775" },
    glowing: "dO",
    halo: "#ef9f27",
    stir: "embers",
  },
  "sefs-feather": {
    rows: [
      ".........oo",
      "........oWo",
      ".......oWLo",
      "......oWLBo",
      ".....oWLBbo",
      "....oWLBbo.",
      "...oWLBbo..",
      "..oLBbso...",
      "..oBbso....",
      ".oqoo......",
      "oq.........",
    ],
    palette: { o: "#3d474f", W: "#eef3f5", L: "#dbe4e8", B: "#c3d0d7", b: "#8fb3c4", q: "#5b6872", s: "#6d93a6" },
    glowing: "",
    halo: "#9fd4ea",
    stir: "wind",
  },
  "mother-brines-conch": {
    rows: [
      "....o......",
      "...oCo.....",
      "..oCcCo....",
      "..oTtTCo...",
      ".oTttTTCo..",
      ".oPPtTTtTo.",
      "oPpPTtTTTTo",
      "oPpPTTtTTo.",
      ".oPPTTTTo..",
      "..ooDDDo...",
      "....ooo....",
    ],
    palette: {
      o: "#1a2a2c",
      T: "#3d6a5a",
      t: "#6f9a88",
      C: "#e6e0d0",
      c: "#a39d8f",
      P: "#d9828e",
      p: "#9c304d",
      D: "#263d41",
    },
    glowing: "",
    halo: "#6fd0b0",
    stir: "bubbles",
  },
  "old-grunds-stone": {
    rows: [
      "..ooooo..",
      ".oHHSSSo.",
      "oHSSaSSso",
      "oSSaAaSso",
      "oSSSaSSso",
      "osSSSSsdo",
      ".ossssdo.",
      "..ooooo..",
    ],
    palette: { o: "#2a2723", H: "#d6d0c0", S: "#a39d8f", s: "#746e64", d: "#5e594f", a: "#e08a1e", A: "#ffd27a" },
    glowing: "aA",
    halo: "#e08a1e",
    stir: "dust",
  },
  "ashen-crown": {
    rows: [
      "...y.Y.y...",
      "..yd...dy..",
      ".y.......y.",
      "Yd..oko..dY",
      "...kOrOk...",
      "Yd.kr.rk.dY",
      "...kOrOk...",
      "Yd..oko..dY",
      ".y.......y.",
      "..yd...dy..",
      "...y.Y.y...",
    ],
    palette: { o: "#0c0708", k: "#221d1c", Y: "#ffda82", y: "#ffd060", d: "#db8424", O: "#ff9a2a", r: "#c8401a" },
    glowing: "Or",
    halo: "#ff9a2a",
    stir: "embers",
  },
  "aurorion-scale": {
    rows: [
      "....o.....",
      "...oWo..o.",
      "...oLo.oWo",
      ".o.oLBooLo",
      "oWooLBoLBo",
      "oLBoBPoBPo",
      ".oBPBPPPo.",
      "..oPPPpo..",
      "...oppo...",
      "....oo....",
    ],
    palette: { o: "#3a4660", W: "#f6f4ff", L: "#dfe8f4", B: "#c8d8ec", P: "#d2c9ee", p: "#b4accc" },
    glowing: "",
    halo: "#9ff0d0",
    stir: "frost",
  },
  "fulgor-drumstick": {
    rows: [
      "...ggg...",
      "..gRRRg..",
      ".gRReRRg.",
      ".gReWeRg.",
      ".gRReRRg.",
      "..grrrg..",
      "...ggg...",
    ],
    palette: { g: "#a87a22", R: "#e0664a", r: "#b8402e", e: "#f2e6c8", W: "#ffffff" },
    glowing: "eW",
    halo: "#8fe8ff",
    stir: "sparks",
  },
  "sahrkhan-fang": {
    rows: [
      "..mmmmm..",
      ".mTTTTTm.",
      "mTdddddTm",
      "mTdTTTdSm",
      "mTdTddTSm",
      "mTdTTTTSm",
      "mTdSSSSSm",
      ".mSddddm.",
      "..mmmmm..",
    ],
    palette: { m: "#8a6e4a", T: "#d8b67e", S: "#b8945e", d: "#604d33" },
    glowing: "",
    halo: "#f3be7c",
    stir: "sand",
  },
};

/** The side of the square a shard is drawn in, halo and all, in its own pixels. */
export const RELIC_BOX = 24;

/** Whether a talisman is drawn as a shard. */
export const hasRelic = (id: string | undefined): id is string => !!id && id in SHARDS;

const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The same colour, faded to the grey of a talisman still charging. */
const dim = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const v = Math.round(90 + (0.3 * r + 0.59 * g + 0.11 * b) * 0.45);
  return `rgb(${v},${v - 2},${v - 6})`;
};

/**
 * Draws a shard centred in a RELIC_BOX square whose top-left corner is at
 * (x, y) on the canvas, `u` canvas pixels to one of its own, `t` seconds
 * into its life; lit and stirring when `ready`.
 */
export const drawRelic = (
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  u: number,
  t: number,
  ready = true
) => {
  const shard = SHARDS[id];
  if (!shard) return;
  const px = (ax: number, ay: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + Math.round(ax) * u, y + Math.round(ay) * u, u, u);
  };
  const w = Math.max(...shard.rows.map((r) => r.length));
  const h = shard.rows.length;
  const mid = RELIC_BOX / 2;
  const bob = ready ? Math.round(Math.sin(t * 2.4)) : 0;
  const left = Math.round(mid - w / 2);
  const top = Math.round(mid - h / 2) + bob;
  ctx.save();

  // A soft halo, dithered on the grid like the fire outfit's torch.
  if (ready) {
    const r = Math.ceil(Math.max(w, h) * 0.75);
    const strength = 0.5 + 0.15 * Math.sin(t * 3);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d > 1) continue;
        const k = (1 - d) * strength;
        if (hash(dx + 40, dy + 40) > k * 2.2) continue;
        ctx.globalAlpha = Math.min(0.45, k);
        px(mid + dx, mid + dy + bob, shard.halo);
      }
    }
    ctx.globalAlpha = 1;
  }

  shard.rows.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      const c = shard.palette[ch];
      if (c) px(left + rx, top + ry, ready ? c : dim(c));
    });
  });
  if (!ready) {
    ctx.restore();
    return;
  }

  // What glows in it breathes.
  if (shard.glowing) {
    ctx.globalAlpha = 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2));
    shard.rows.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (shard.glowing.includes(ch)) px(left + rx, top + ry, "#ffffff");
      });
    });
    ctx.globalAlpha = 1;
  }

  // And its element stirs round it.
  switch (shard.stir) {
    case "embers":
      for (let i = 0; i < 3; i++) {
        const l = (t * 0.8 + hash(i, 1)) % 1;
        ctx.globalAlpha = 1 - l;
        px(left + 1 + hash(i, 5) * (w - 2) + Math.sin(t * 4 + i), top - l * 7, l < 0.4 ? "#ffd060" : "#ff9a2a");
      }
      break;
    case "wind":
      for (let i = 0; i < 2; i++) {
        const l = (t * 0.9 + hash(i, 2)) % 1;
        const sy = top + 2 + Math.round(hash(i, 3) * (h - 4));
        const sx = left - 3 + l * (w + 6);
        ctx.globalAlpha = Math.sin(Math.PI * l) * 0.9;
        px(sx, sy, "#dbe4e8");
        px(sx - 1, sy, "#c3d0d7");
        px(sx - 2, sy, "#c3d0d7");
      }
      break;
    case "bubbles":
      for (let i = 0; i < 3; i++) {
        const l = (t * 0.6 + hash(i, 6)) % 1;
        ctx.globalAlpha = l < 0.8 ? 0.9 : (1 - l) * 4.5;
        px(
          left + 2 + hash(i, 7) * (w - 4) + Math.round(Math.sin(t * 5 + i)),
          top + h - l * (h + 5),
          i % 2 ? "#b8f0e0" : "#6fd0b0"
        );
      }
      break;
    case "dust":
      for (let i = 0; i < 2; i++) {
        const l = (t * 0.5 + hash(i, 8)) % 1;
        ctx.globalAlpha = l < 0.8 ? 1 : (1 - l) * 5;
        px(left + 1 + hash(i, 9) * (w - 2), top + h + l * 6, i % 2 ? "#a39d8f" : "#746e64");
      }
      break;
    case "frost": {
      const k = Math.floor(t * 3) % 5;
      const l = (t * 3) % 1;
      if (l < 0.5) {
        ctx.globalAlpha = 1 - l * 2;
        const sx = left + Math.round(hash(k, 1) * w);
        const sy = top + Math.round(hash(k, 2) * h);
        px(sx, sy, "#ffffff");
        px(sx - 1, sy, "#dff8ff");
        px(sx + 1, sy, "#dff8ff");
        px(sx, sy - 1, "#dff8ff");
        px(sx, sy + 1, "#dff8ff");
      }
      break;
    }
    case "sparks": {
      const beat = Math.floor(t * 9);
      if (hash(beat, 7) > 0.45) {
        let a = hash(beat, 2) * Math.PI * 2;
        for (let s = 0; s < 4; s++) {
          a += 0.45;
          const r = w / 2 + 1 + hash(beat, s);
          px(mid + Math.cos(a) * r, mid + bob + Math.sin(a) * r * 0.8, s % 2 ? "#8fe8ff" : "#dff8ff");
        }
      }
      break;
    }
    case "sand":
      for (let i = 0; i < 3; i++) {
        const l = (t * 0.7 + hash(i, 9)) % 1;
        ctx.globalAlpha = l < 0.8 ? 1 : (1 - l) * 5;
        px(left + 2 + hash(i, 4) * (w - 4), top + h - 1 + l * 8, i % 2 ? "#d8b67e" : "#b8945e");
      }
      break;
  }
  ctx.restore();
};
