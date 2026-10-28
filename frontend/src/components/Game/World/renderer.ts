import { Light } from "../../../world/ascii";
import { Backdrop } from "../../../world/backdrop";
import { cellOf, Rgb } from "../../../world/ascii";
import { Frame, gustAt, sampleAt } from "../../../world/compose";
import { indexOfGlyph, materialOf, materialTable, runIndices } from "../../../world/materials";
import { StillLayers } from "../../../world/paint";
import { BACKDROP, Layer, WORLD } from "../../../world/raster";
import { GlyphGrid } from "../../../world/view";
import { GRID_RADIUS } from "../../../utils/board";
import { ATLAS_COLS, buildAtlas } from "./atlas";
import { CELLS, GLYPHS, MAX_LIGHTS, VERTEX } from "./shaders";

/**
 * Draws a frame of the scene as glyphs: WebGL2 where the device has it,
 * which is where the 60 frames a second are held, and Canvas 2D otherwise,
 * running the same pass in TypeScript (world/ascii.ts). Both take the same
 * inputs and show the same picture.
 */

export type Overlay = { data: Uint8Array; cols: number; rows: number };

export type DrawInput = {
  grid: GlyphGrid;
  frame: Frame;
  overlay: Overlay;
  tick: number;
};

export interface Renderer {
  readonly kind: "webgl2" | "canvas2d";
  setStill(still: StillLayers, backdrop: Backdrop): void;
  setFore(fore: Layer): void;
  /** Uploads what changed of the fighters' layer: the union of the rectangles drawn this frame and the last. */
  setDyn(dyn: Layer, rect: { x: number; y: number; w: number; h: number } | null): void;
  draw(input: DrawInput): void;
  dispose(): void;
}

const TEXTURES = ["uBase", "uBaseAux", "uFol", "uFolAux", "uDyn", "uBack", "uBackTop", "uFore", "uMat", "uRuns", "uOverlay"] as const;

const compile = (gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram => {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
};

class GlRenderer implements Renderer {
  readonly kind = "webgl2" as const;
  private cells: WebGLProgram;
  private glyphs: WebGLProgram;
  private tex = new Map<string, WebGLTexture>();
  private fbo: WebGLFramebuffer;
  private fg: WebGLTexture;
  private bg: WebGLTexture;
  private cellSize = { cols: 0, rows: 0 };
  private glyphSize = { gw: 0, gh: 0 };
  private atlas: WebGLTexture;
  private foreSize = { w: 1, h: 1 };
  private uni = new Map<string, WebGLUniformLocation | null>();

  constructor(private gl: WebGL2RenderingContext, private canvas: HTMLCanvasElement) {
    this.cells = compile(gl, VERTEX, CELLS);
    this.glyphs = compile(gl, VERTEX, GLYPHS);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const name of TEXTURES) this.tex.set(name, this.texture());
    this.fg = this.texture();
    this.bg = this.texture();
    this.atlas = this.texture();
    this.fbo = gl.createFramebuffer()!;
    // The tables never change: upload them once.
    const mat = materialTable();
    this.upload("uMat", mat.length / 4, 1, mat);
    const runs = runIndices();
    const runsRgba = new Uint8Array(runs.length * 4);
    runs.forEach((v, i) => (runsRgba[i * 4] = v));
    this.upload("uRuns", runs.length, 1, runsRgba);
    this.upload("uDyn", WORLD.w, WORLD.h, new Uint8Array(WORLD.w * WORLD.h * 4));
    this.upload("uOverlay", 1, 1, new Uint8Array(4));
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private upload(name: string, w: number, h: number, data: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.get(name)!);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  private loc(p: WebGLProgram, name: string) {
    const k = `${p === this.cells ? "c" : "g"}:${name}`;
    if (!this.uni.has(k)) this.uni.set(k, this.gl.getUniformLocation(p, name));
    return this.uni.get(k)!;
  }

  setStill(still: StillLayers, backdrop: Backdrop) {
    this.upload("uBase", WORLD.w, WORLD.h, still.base.data);
    this.upload("uBaseAux", WORLD.w, WORLD.h, still.baseAux.data);
    this.upload("uFol", WORLD.w, WORLD.h, still.foliage.data);
    this.upload("uFolAux", WORLD.w, WORLD.h, still.foliageAux.data);
    this.upload("uBack", BACKDROP.w, BACKDROP.h, backdrop.layer.data);
    const tops = new Uint8Array(BACKDROP.w * 4);
    backdrop.tops.forEach((v, i) => (tops[i * 4] = v));
    this.upload("uBackTop", BACKDROP.w, 1, tops);
  }

  setFore(fore: Layer) {
    this.foreSize = { w: fore.w, h: fore.h };
    this.upload("uFore", fore.w, fore.h, fore.data);
  }

  setDyn(dyn: Layer, rect: { x: number; y: number; w: number; h: number } | null) {
    if (!rect) return;
    const gl = this.gl;
    const x = Math.max(0, Math.floor(rect.x) - dyn.x0);
    const y = Math.max(0, Math.floor(rect.y) - dyn.y0);
    const w = Math.min(dyn.w - x, Math.ceil(rect.w) + 1);
    const h = Math.min(dyn.h - y, Math.ceil(rect.h) + 1);
    if (w <= 0 || h <= 0) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.get("uDyn")!);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, dyn.w);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, dyn.data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  private ensure(grid: GlyphGrid) {
    const gl = this.gl;
    if (grid.gw !== this.glyphSize.gw || grid.gh !== this.glyphSize.gh) {
      this.glyphSize = { gw: grid.gw, gh: grid.gh };
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas(grid.gw, grid.gh));
    }
    if (grid.cols !== this.cellSize.cols || grid.rows !== this.cellSize.rows) {
      this.cellSize = { cols: grid.cols, rows: grid.rows };
      for (const t of [this.fg, this.bg]) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fg, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.bg, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const w = grid.cols * grid.gw;
    const h = grid.rows * grid.gh;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw({ grid, frame, overlay, tick }: DrawInput) {
    const gl = this.gl;
    this.ensure(grid);
    this.upload("uOverlay", overlay.cols, overlay.rows, overlay.data);

    // Pass A: one fragment per text cell.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, grid.cols, grid.rows);
    gl.useProgram(this.cells);
    TEXTURES.forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.get(name)!);
      gl.uniform1i(this.loc(this.cells, name), i);
    });
    const p = this.cells;
    gl.uniform2i(this.loc(p, "uWorld0"), WORLD.x0, WORLD.y0);
    gl.uniform2i(this.loc(p, "uWorldSize"), WORLD.w, WORLD.h);
    gl.uniform2i(this.loc(p, "uBackSize"), BACKDROP.w, BACKDROP.h);
    gl.uniform2i(this.loc(p, "uForeSize"), this.foreSize.w, this.foreSize.h);
    gl.uniform2i(this.loc(p, "uCells"), grid.cols, grid.rows);
    gl.uniform2f(this.loc(p, "uGrid0"), grid.left, grid.top);
    gl.uniform2f(this.loc(p, "uStep"), grid.stepX, grid.stepY);
    const v = frame.view;
    gl.uniform4f(this.loc(p, "uView"), v.left, v.top, v.right, v.bottom);
    gl.uniform1f(this.loc(p, "uTime"), frame.time);
    gl.uniform1f(this.loc(p, "uAmbient"), frame.ambient);
    gl.uniform1f(this.loc(p, "uBoardR"), GRID_RADIUS);
    gl.uniform1i(this.loc(p, "uTick"), tick);
    gl.uniform1i(this.loc(p, "uSlash"), indexOfGlyph("/"));
    const lights = frame.lights.slice(0, MAX_LIGHTS);
    gl.uniform1i(this.loc(p, "uLightN"), lights.length);
    if (lights.length) {
      gl.uniform4fv(this.loc(p, "uLightA[0]"), lights.flatMap((l) => [l.x, l.y, l.radius, l.strength]));
      gl.uniform3fv(this.loc(p, "uLightC[0]"), lights.flatMap((l) => l.color));
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass B: every screen pixel reads its cell and its glyph.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.glyphs);
    const q = this.glyphs;
    [this.fg, this.bg, this.atlas].forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
    });
    gl.uniform1i(this.loc(q, "uFg"), 0);
    gl.uniform1i(this.loc(q, "uBg"), 1);
    gl.uniform1i(this.loc(q, "uAtlas"), 2);
    gl.uniform2i(this.loc(q, "uGlyph"), grid.gw, grid.gh);
    gl.uniform2i(this.loc(q, "uCanvas"), this.canvas.width, this.canvas.height);
    gl.uniform1i(this.loc(q, "uAtlasCols"), ATLAS_COLS);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /*
   * Frees what this renderer made, and nothing else. Losing the context here
   * broke the next renderer on the same canvas: React mounts effects twice
   * in development, and a canvas has one WebGL context for its whole life.
   */
  dispose() {
    const gl = this.gl;
    for (const t of [...this.tex.values(), this.fg, this.bg, this.atlas]) gl.deleteTexture(t);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteProgram(this.cells);
    gl.deleteProgram(this.glyphs);
  }
}

/**
 * The fallback, for a device without WebGL2: the same pass in TypeScript,
 * glyphs copied from atlases tinted per colour (colours are snapped to a
 * coarse grid, so a frame needs a few hundred tints at most).
 */
class CanvasRenderer implements Renderer {
  readonly kind = "canvas2d" as const;
  private still: StillLayers | null = null;
  private backdrop: Backdrop | null = null;
  private fore: Layer | null = null;
  private dyn: Layer | null = null;
  private atlas: HTMLCanvasElement | null = null;
  private tints = new Map<number, HTMLCanvasElement>();
  private size = { gw: 0, gh: 0 };
  private g: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, g: CanvasRenderingContext2D) {
    this.g = g;
  }
  setStill(still: StillLayers, backdrop: Backdrop) {
    this.still = still;
    this.backdrop = backdrop;
  }
  setFore(fore: Layer) {
    this.fore = fore;
  }
  setDyn(dyn: Layer) {
    this.dyn = dyn;
  }

  private tinted(c: Rgb): HTMLCanvasElement {
    const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
    let t = this.tints.get(key);
    if (!t) {
      const a = this.atlas!;
      t = document.createElement("canvas");
      t.width = a.width;
      t.height = a.height;
      const g = t.getContext("2d")!;
      g.drawImage(a, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = `rgb(${(c[0] >> 4) * 17},${(c[1] >> 4) * 17},${(c[2] >> 4) * 17})`;
      g.fillRect(0, 0, t.width, t.height);
      this.tints.set(key, t);
    }
    return t;
  }

  draw({ grid, frame, overlay, tick }: DrawInput) {
    if (!this.still || !this.backdrop || !this.fore || !this.dyn) return;
    if (grid.gw !== this.size.gw || grid.gh !== this.size.gh) {
      this.size = { gw: grid.gw, gh: grid.gh };
      this.atlas = buildAtlas(grid.gw, grid.gh);
      this.tints.clear();
    }
    const w = grid.cols * grid.gw;
    const h = grid.rows * grid.gh;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const g = this.g;
    const f: Frame = { ...frame, still: this.still, backdrop: this.backdrop, fore: this.fore, dyn: this.dyn };
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const left = grid.left + col * grid.stepX;
        const top = grid.top + row * grid.stepY;
        const samples = [];
        for (let i = 0; i < 6; i++) {
          samples.push(sampleAt(f, left + ((i % 2) * 0.5 + 0.25) * grid.stepX, top + (Math.floor(i / 2) / 3 + 1 / 6) * grid.stepY));
        }
        const cx = left + grid.stepX / 2;
        const cy = top + grid.stepY / 2;
        const cell = cellOf(samples, Math.floor(cx), Math.floor(cy), tick, gustAt(cx, cy, frame.time));
        const o = (row * overlay.cols + col) * 4;
        const best = Math.max(...samples.map((s) => materialOf(s.mat).priority));
        if (overlay.data[o + 3] && best < 9) {
          cell.glyph = overlay.data[o + 3] - 1;
          cell.fg = [Math.min(255, overlay.data[o] * 1.35 + 10), Math.min(255, overlay.data[o + 1] * 1.35 + 10), Math.min(255, overlay.data[o + 2] * 1.35 + 10)];
        }
        const e = Math.max(Math.abs((col + 0.5) / grid.cols - 0.5), Math.abs((row + 0.5) / grid.rows - 0.5) * 1.15) * 2;
        const vg = e < 0.72 ? 1 : e < 0.86 ? 0.84 : e < 0.96 ? 0.7 : 0.58;
        g.fillStyle = `rgb(${cell.bg[0] * vg},${cell.bg[1] * vg},${cell.bg[2] * vg})`;
        g.fillRect(col * grid.gw, row * grid.gh, grid.gw, grid.gh);
        if (cell.glyph) {
          const t = this.tinted([cell.fg[0] * vg, cell.fg[1] * vg, cell.fg[2] * vg]);
          const sx = (cell.glyph % ATLAS_COLS) * grid.gw;
          const sy = Math.floor(cell.glyph / ATLAS_COLS) * grid.gh;
          g.drawImage(t, sx, sy, grid.gw, grid.gh, col * grid.gw, row * grid.gh, grid.gw, grid.gh);
        }
      }
    }
  }
  dispose() {}
}

/**
 * The best renderer this device has, or null when this canvas cannot give
 * one: a canvas whose WebGL2 failed has spent its context, and the caller
 * starts again on a fresh canvas with `prefer2d`.
 */
export const createRenderer = (canvas: HTMLCanvasElement, prefer2d = false): Renderer | null => {
  if (!prefer2d) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (gl) {
      try {
        return new GlRenderer(gl, canvas);
      } catch (e) {
        console.warn("ASCII view: WebGL2 failed, falling back to Canvas 2D", e);
        return null;
      }
    }
  }
  const g = canvas.getContext("2d");
  return g ? new CanvasRenderer(canvas, g) : null;
};

export type { Light };
