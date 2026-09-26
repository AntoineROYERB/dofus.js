import { Position } from "../types/game";
import { isoToScreen } from "../utils/isoUtils";
import { FX_ROOT, FxManifest, FxSheet, FxSpell, sheetOf } from "../utils/fxManifest";
import { Geometry } from "./spellFx";
import { drawBolt, drawBurst, drawPylonCharge, gridPixel, pylonTop } from "./pylon";

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
  /**
   * The relay it went out from, when it did: the spell strikes the relay
   * first, as lightning does a rod, then bounces from it to its target.
   */
  via?: Position;
  /** The caster traded places with their pylon: `target` is where they went. */
  swap?: boolean;
  /** The legendary who appears to cast it, and where. */
  legend?: LegendCast;
};

/** A legendary stepping onto the board to cast its ultimate. */
export type LegendCast = {
  /** Its attack sheet, under animation/legendaries/ (lossless WebP). */
  file: string;
  frames: number;
  /** The cell it stands on, and the one it faces. */
  at: Position;
  facing: Position;
};

/*
 * The bestiary's legendaries: 160-pixel frames, one row per direction in
 * this order, feet on the shadow at 116. They are drawn larger than a
 * fighter, one art pixel to a 90th of a tile, played at 24 frames a second
 * as the bestiary plays them, and fade in and out around the attack.
 */
const LEGEND_ROOT = "/animation/legendaries/";
const LEGEND_ART = 160;
const LEGEND_FEET = 116;
const LEGEND_ROWS = ["NW", "W", "SW", "S", "SE", "E", "NE", "N"];
const LEGEND_FPS = 24;
const LEGEND_FADE_IN = 140;
const LEGEND_FADE_OUT = 320;
/** How far into its attack the blow lands, from 0 to 1. */
const LEGEND_STRIKE = 0.55;

/*
 * A spell sent through Sef's relay, from the sky to the ground: lightning
 * falls on the pylon's orb, the charge runs down its mast, then an arc leaps
 * from the orb to the target. How long each takes, in ms.
 */
const RELAY_STRIKE = 260;
const RELAY_CHARGE = 340;
const RELAY_ARC = 300;
const RELAY_BURST = 420;
/** How high above the pylon the lightning starts, in grid pixels. */
const SKY = 150;

/** Something drawn by code rather than from a sheet, for a while. */
type Drawing = {
  born: number;
  dur: number;
  /** `t` is the time since it started, in ms; `v` the same from 0 to 1. */
  draw: (ctx: CanvasRenderingContext2D, t: number, v: number) => void;
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
  private drawings: Drawing[] = [];
  private legendImages = new Map<string, HTMLImageElement>();
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
    if (cast.swap) return this.playSwap(cast, now);
    if (cast.legend) return this.playLegend(cast, cast.legend, now);
    const via = cast.via;
    if (!via || (via.x === cast.origin.x && via.y === cast.origin.y)) {
      return this.playFrom(cast, now, true);
    }
    // The caster's circle, then the lightning Sef calls down on the relay.
    const sigil = cast.spell.fx.find((k) => k.endsWith("/sigil"));
    const sigilSheet = sigil && sheetOf(this.manifest, sigil);
    if (sigilSheet) this.add(sigilSheet, now, LOOP_FOR, cast.origin, cast.origin);
    const target = cast.target;
    // Measured when drawn, so a resize mid-cast keeps the bolt on its cells.
    const u = () => gridPixel(this.geometry.tileSize.width);
    const top = () => {
      const c = this.screen(via);
      return pylonTop(c.x, c.y, u());
    };
    const chest = (): [number, number] => {
      const c = this.screen(target);
      return [c.x, c.y - 16 * u()];
    };

    let at = SIGIL_LEAD;
    this.drawings.push({
      born: now + at,
      dur: RELAY_STRIKE,
      draw: (ctx, t) => {
        const [x, y] = top();
        drawBolt(ctx, [x + 6 * u(), y - SKY * u()], [x, y], u(), Math.floor(t / 50), 1, 4.5);
      },
    });
    this.drawings.push({
      born: now + at + RELAY_STRIKE * 0.8,
      dur: RELAY_BURST,
      draw: (ctx, _t, v) => {
        const [x, y] = top();
        drawBurst(ctx, x, y, u(), v, 10);
      },
    });
    at += RELAY_STRIKE;

    this.drawings.push({
      born: now + at,
      dur: RELAY_CHARGE,
      draw: (ctx, _t, v) => {
        const c = this.screen(via);
        drawPylonCharge(ctx, c.x, c.y, u(), v);
      },
    });
    at += RELAY_CHARGE;

    if (via.x !== target.x || via.y !== target.y) {
      this.drawings.push({
        born: now + at,
        dur: RELAY_ARC,
        draw: (ctx, t) => drawBolt(ctx, top(), chest(), u(), 100 + Math.floor(t / 50)),
      });
      this.drawings.push({
        born: now + at + RELAY_ARC * 0.85,
        dur: RELAY_BURST,
        draw: (ctx, _t, v) => {
          const [x, y] = chest();
          drawBurst(ctx, x, y, u(), v, 12);
        },
      });
      at += RELAY_ARC;
    }

    // Then what the spell does where it lands. The arc is its lightning, so
    // a lightning sheet falling from the sky would only say it twice.
    const rest = {
      ...cast,
      origin: via,
      via: undefined,
      spell: { ...cast.spell, fx: cast.spell.fx.filter((k) => k !== "air/lightning") },
    };
    return at + this.playFrom(rest, now + at, false);
  }

  /**
   * A legendary's ultimate: the legendary steps onto the board, plays its
   * own attack towards the target, and where the blow lands the spell's
   * sheets play in the element its caster wears.
   */
  private playLegend(cast: SheetCast, legend: LegendCast, now: number): number {
    let image = this.legendImages.get(legend.file);
    if (!image) {
      image = new Image();
      image.src = LEGEND_ROOT + legend.file;
      this.legendImages.set(legend.file, image);
    }
    const img = image;
    const attack = (legend.frames / LEGEND_FPS) * 1000;
    const row = (): number => {
      const a = this.screen(legend.at);
      const b = this.screen(legend.facing);
      const names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
      const octant = ((Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) % 8) + 8) % 8;
      return Math.max(0, LEGEND_ROWS.indexOf(names[octant]));
    };
    this.drawings.push({
      born: now,
      dur: LEGEND_FADE_IN + attack + LEGEND_FADE_OUT,
      draw: (ctx, t) => {
        if (!img.complete || img.naturalWidth === 0) return;
        const k = this.geometry.tileSize.width / 90;
        const c = this.screen(legend.at);
        const playing = Math.max(0, t - LEGEND_FADE_IN);
        const frame = Math.min(legend.frames - 1, Math.floor((playing / 1000) * LEGEND_FPS));
        const alpha =
          t < LEGEND_FADE_IN
            ? t / LEGEND_FADE_IN
            : playing > attack
              ? Math.max(0, 1 - (playing - attack) / LEGEND_FADE_OUT)
              : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          img,
          frame * LEGEND_ART,
          row() * LEGEND_ART,
          LEGEND_ART,
          LEGEND_ART,
          Math.round(c.x - (LEGEND_ART / 2) * k),
          Math.round(c.y - LEGEND_FEET * k),
          Math.round(LEGEND_ART * k),
          Math.round(LEGEND_ART * k)
        );
        ctx.restore();
      },
    });
    const strike = LEGEND_FADE_IN + attack * LEGEND_STRIKE;
    return strike + this.playFrom({ ...cast, legend: undefined }, now + strike, false);
  }

  /**
   * Sef and the pylon trading places: the circle where Sef stood, then one
   * bolt between the two cells, the way the charge would run from the orb.
   */
  private playSwap(cast: SheetCast, now: number): number {
    const sigil = cast.spell.fx.find((k) => k.endsWith("/sigil"));
    const sigilSheet = sigil && sheetOf(this.manifest, sigil);
    if (sigilSheet) this.add(sigilSheet, now, LOOP_FOR, cast.origin, cast.origin);
    const u = () => gridPixel(this.geometry.tileSize.width);
    const chest = (p: Position): [number, number] => {
      const c = this.screen(p);
      return [c.x, c.y - 16 * u()];
    };
    const at = SIGIL_LEAD * 0.5;
    this.drawings.push({
      born: now + at,
      dur: RELAY_ARC,
      draw: (ctx, t) => drawBolt(ctx, chest(cast.origin), chest(cast.target), u(), 200 + Math.floor(t / 50)),
    });
    for (const end of [cast.origin, cast.target]) {
      this.drawings.push({
        born: now + at + RELAY_ARC * 0.6,
        dur: RELAY_BURST,
        draw: (ctx, _t, v) => {
          const [x, y] = chest(end);
          drawBurst(ctx, x, y, u(), v, 10);
        },
      });
    }
    return at + RELAY_ARC;
  }

  private playFrom(cast: SheetCast, now: number, withSigil: boolean): number {
    const sheets = cast.spell.fx
      .map((key) => ({ key, sheet: sheetOf(this.manifest, key) }))
      .filter((s): s is { key: string; sheet: FxSheet } => !!s.sheet);

    let landsAt = withSigil ? SIGIL_LEAD : 0;
    const sigil = sheets.find((s) => s.key.endsWith("/sigil"));
    if (sigil && withSigil) this.add(sigil.sheet, now, LOOP_FOR, cast.origin, cast.origin);

    // Whatever has a row per direction flies from the caster to the target.
    const flying = sheets.filter((s) => s.sheet.directions && s.sheet.directions.length > 0);
    const same = cast.origin.x === cast.target.x && cast.origin.y === cast.target.y;
    for (const f of flying) {
      if (same) continue;
      const cells = Math.abs(cast.target.x - cast.origin.x) + Math.abs(cast.target.y - cast.origin.y);
      const flight = Math.max(MIN_FLIGHT, (cells / CELLS_PER_SECOND) * 1000);
      const lead = withSigil ? SIGIL_LEAD : 0;
      this.add(f.sheet, now + lead, flight, cast.origin, cast.target, this.rowFacing(f.sheet, cast.origin, cast.target));
      landsAt = Math.max(landsAt, lead + flight);
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
    this.drawings = [];
  }

  get busy() {
    return this.sprites.length > 0 || this.drawings.length > 0;
  }

  /**
   * Draws every sheet playing now. Ground sheets go on the ground canvas,
   * under the fighters; the rest over them.
   */
  frame(now: number, ground: CanvasRenderingContext2D, air: CanvasRenderingContext2D) {
    const scale = this.spriteScale ?? this.geometry.tileSize.width / 256;
    if (scale <= 0) return;
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const t = now - d.born;
      if (t < 0) continue;
      if (t >= d.dur) {
        this.drawings.splice(i, 1);
        continue;
      }
      d.draw(air, t, t / d.dur);
    }
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
