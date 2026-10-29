import { GLYPHS } from "../../../world/materials";

/** The atlas's width, in glyphs. */
export const ATLAS_COLS = 16;

const FONT = 'Menlo, "SF Mono", ui-monospace, "DejaVu Sans Mono", Consolas, monospace';

/**
 * Every glyph the view can show, drawn once, white on transparent, at the
 * exact size of a text cell in device pixels. Both renderers draw from it —
 * the GPU looks a glyph up, the fallback copies it — and nothing calls
 * fillText per cell, which is what made the mock-up crawl.
 */
export const buildAtlas = (gw: number, gh: number): HTMLCanvasElement => {
  const rows = Math.ceil(GLYPHS.length / ATLAS_COLS);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * gw;
  canvas.height = rows * gh;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = Math.max(6, gh - 1);
  g.font = `bold ${size}px ${FONT}`;
  // A monospace letter at this size is a little wider than the cell: squeeze
  // it to fit rather than let it bleed into its neighbour.
  const wide = g.measureText("M").width;
  const squeeze = wide > gw ? gw / wide : 1;
  [...GLYPHS].forEach((ch, i) => {
    const x = (i % ATLAS_COLS) * gw;
    const y = Math.floor(i / ATLAS_COLS) * gh;
    g.save();
    g.beginPath();
    g.rect(x, y, gw, gh);
    g.clip();
    if (ch === "━" || ch === "▔" || ch === "▁") {
      // The neon's strokes fill the cell's width, so a line reads unbroken.
      const t = Math.max(1, Math.round(gh * 0.16));
      const yy = ch === "▔" ? y : ch === "▁" ? y + gh - t : y + Math.round((gh - t) / 2);
      g.fillRect(x, yy, gw, t);
    } else {
      g.translate(x + gw / 2, y + gh / 2 + 1);
      g.scale(squeeze, 1);
      g.fillText(ch, 0, 0);
    }
    g.restore();
  });
  return canvas;
};
