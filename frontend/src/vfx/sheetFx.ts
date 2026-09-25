import { Position } from "../types/game";
import { isoToScreen } from "../utils/isoUtils";
import { FX_ROOT, FxManifest, FxSheet, FxSpell, sheetOf } from "../utils/fxManifest";
import { Geometry } from "./spellFx";

/** The sheets are drawn at twelve frames a second, as in the grimoire. */
const FPS = 12;
/** How long a looping sheet — a sigil, a wall, a pool — plays for a cast. */
const LOOP_FOR = 1100;
/** How long the sigil burns under the caster before the spell leaves. */
const SIGIL_LEAD = 180;
/** A projectile's speed, in cells a second, and its shortest flight. */
const CELLS_PER_SECOND = 11;
const MIN_FLIGHT = 220;

type Sprite = {
  sheet: FxSheet;
  image: HTMLImageElement;
  born: number;
  dur: number;
  row: number;
  /** Grid position it stands on, or flies from and to. */
  from: Position;
  to: Position;
};

/** What a cast needs to be drawn from the grimoire's sheets. */
export type SheetCast = {
  spell: FxSpell;
  origin: Position;
  target: Position;
  /** Every cell the spell covered. */
  area: Position[];
};

/**
 * Plays the armour grimoire's spell sheets on the board, over the procedural
 * effects' canvases: the sigil under whoever casts, the projectile flying the
 * way it was thrown, and at the far end whatever the spell does — a column of
 * water, a wall of fire along every cell it covers, a meteor on its mark.
 *
 * It keeps no marks of its own. What stays on the paper is still the
 * procedural layer's, laid down at the moment this one says the spell lands.
 */
export class SheetFx {
  private images = new Map<string, HTMLImageElement>();
  private sprites: Sprite[] = [];
  private geometry: Geometry = { tileSize: { width: 0, height: 0 }, centerX: 0, centerY: 0 };
  /** Sheet pixels to screen pixels; one tile's width is 256 unless told. */
  private spriteScale: number | null = null;

  constructor(private manifest: FxManifest) {}

  /**
   * Where the cells are. A stand that draws its fighter larger than its
   * tiles — the wardrobe's — passes the fighter's scale, so the spell is
   * drawn to the fighter's size while landing on the stand's cells.
   */
  resize(geometry: Geometry, spriteScale?: number) {
    this.geometry = geometry;
    this.spriteScale = spriteScale ?? null;
  }

  private image(file: string): HTMLImageElement {
    let image = this.images.get(file);
    if (!image) {
      image = new Image();
      image.src = FX_ROOT + file;
      this.images.set(file, image);
    }
    return image;
  }

  /** Loads a spell's sheets ahead of its first cast. */
  preload(spell: FxSpell) {
    for (const key of spell.fx) {
      const sheet = sheetOf(this.manifest, key);
      if (sheet) this.image(sheet.file);
    }
  }

  private screen(p: Position) {
    const { tileSize, centerX, centerY } = this.geometry;
    return isoToScreen(p.x, p.y, tileSize, centerX, centerY);
  }

  /** The row of a directional sheet facing from one cell to another. */
  private rowFacing(sheet: FxSheet, from: Position, to: Position): number {
    const dirs = sheet.directions;
    if (!dirs || dirs.length === 0) return 0;
    const a = this.screen(from);
    const b = this.screen(to);
    const angle = Math.atan2(b.y - a.y, b.x - a.x); // screen space, y down
    const names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
    const octant = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    const row = dirs.indexOf(names[octant]);
    return row < 0 ? 0 : row;
  }

  private add(sheet: FxSheet, born: number, dur: number, from: Position, to: Position, row = 0) {
    this.sprites.push({ sheet, image: this.image(sheet.file), born, dur, row, from, to });
  }

  /**
   * Plays a cast and says, in milliseconds from now, when it lands: the
   * moment its marks belong on the paper.
   */
  play(cast: SheetCast, now = performance.now()): number {
    const sheets = cast.spell.fx
      .map((key) => ({ key, sheet: sheetOf(this.manifest, key) }))
      .filter((s): s is { key: string; sheet: FxSheet } => !!s.sheet);

    let landsAt = SIGIL_LEAD;
    const sigil = sheets.find((s) => s.key.endsWith("/sigil"));
    if (sigil) this.add(sigil.sheet, now, LOOP_FOR, cast.origin, cast.origin);

    // Whatever has a row per direction flies from the caster to the target.
    const flying = sheets.filter((s) => s.sheet.directions && s.sheet.directions.length > 0);
    const same = cast.origin.x === cast.target.x && cast.origin.y === cast.target.y;
    for (const f of flying) {
      if (same) continue;
      const cells = Math.abs(cast.target.x - cast.origin.x) + Math.abs(cast.target.y - cast.origin.y);
      const flight = Math.max(MIN_FLIGHT, (cells / CELLS_PER_SECOND) * 1000);
      this.add(f.sheet, now + SIGIL_LEAD, flight, cast.origin, cast.target, this.rowFacing(f.sheet, cast.origin, cast.target));
      landsAt = Math.max(landsAt, SIGIL_LEAD + flight);
    }

    // Everything else happens where the spell lands: a looping sheet on the
    // ground or among the fighters covers every cell the spell did, anything
    // else plays once on its mark.
    for (const s of sheets) {
      if (s === sigil || flying.includes(s)) continue;
      const once = !s.sheet.loop;
      const dur = once ? (s.sheet.frames / FPS) * 1000 : LOOP_FOR;
      const spread = !once && s.sheet.layer !== "air" && cast.area.length > 1;
      for (const cell of spread ? cast.area : [cast.target]) {
        this.add(s.sheet, now + landsAt, dur, cell, cell);
      }
    }
    return landsAt;
  }

  reset() {
    this.sprites = [];
  }

  get busy() {
    return this.sprites.length > 0;
  }

  /**
   * Draws every sheet playing now. Ground sheets go on the ground canvas,
   * under the fighters; the rest over them.
   */
  frame(now: number, ground: CanvasRenderingContext2D, air: CanvasRenderingContext2D) {
    const scale = this.spriteScale ?? this.geometry.tileSize.width / 256;
    if (scale <= 0) return;
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      const t = now - s.born;
      if (t < 0) continue;
      if (t >= s.dur) {
        this.sprites.splice(i, 1);
        continue;
      }
      if (!s.image.complete || s.image.naturalWidth === 0) continue;
      const { sheet } = s;
      const frame = sheet.loop
        ? Math.floor((t / 1000) * FPS) % sheet.frames
        : Math.min(sheet.frames - 1, Math.floor((t / 1000) * FPS));

      const a = this.screen(s.from);
      const b = this.screen(s.to);
      const p = s.from === s.to ? 0 : t / s.dur;
      const x = a.x + (b.x - a.x) * p;
      // A thrown sheet flies at chest height, not along the floor.
      const lift = sheet.directions && sheet.directions.length > 0 ? scale * 128 * 0.9 : 0;
      const y = a.y + (b.y - a.y) * p - lift;

      const ctx = sheet.layer === "ground" ? ground : air;
      // Looping sheets fade out over their last fifth rather than vanish.
      const fade = sheet.loop ? Math.min(1, (s.dur - t) / (s.dur * 0.2)) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.drawImage(
        s.image,
        frame * sheet.frameWidth,
        s.row * sheet.frameHeight,
        sheet.frameWidth,
        sheet.frameHeight,
        x - sheet.anchor[0] * scale,
        y - sheet.anchor[1] * scale,
        sheet.frameWidth * scale,
        sheet.frameHeight * scale
      );
      ctx.restore();
    }
  }
}
