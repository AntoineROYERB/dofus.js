import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import SpriteAnimation from "./SpriteAnimation";
import { CharacterStand, STAND } from "./CharacterStand";
import { SPRITE } from "../../constants";
import {
  FX_ROOT,
  FxManifest,
  FxSpell,
  outfitSheet,
  sheetOf,
  useFxManifest,
} from "../../utils/fxManifest";
import { TalismanOrbit } from "./TalismanOrbit";
import { SheetFx } from "../../vfx/sheetFx";
import { Position } from "../../types/game";

const idle = {
  spriteSheet: "/animation/Idle.png",
  framesPerDirection: 23,
  frameWidth: 256,
  frameHeight: 256,
  directionMap: { NW: 0, W: 1, SW: 2, S: 3, SE: 4, E: 5, NE: 6, N: 7 },
} as const;

/** An attack sheet: bigger frames, six of them, its rows starting at N. */
const ATTACK = {
  framesPerDirection: 6,
  frameWidth: 384,
  frameHeight: 384,
  directionMap: { N: 0, NW: 1, W: 2, SW: 3, S: 4, SE: 5, E: 6, NE: 7 },
} as const;
/** How long the pose of a cast is held: its six frames at twelve a second. */
const POSE_FOR = 520;

/**
 * A spell cast on the stand, from the middle tile: which of the grimoire's
 * sheets it plays, and on which of the stand's cells, in the board's own
 * coordinates with the middle tile at 0,0. A new `key` casts it again.
 */
export interface ShowcaseCast {
  key: number;
  spell: FxSpell;
  target: Position;
  area: Position[];
}

/**
 * One fighter around the stand. Several can share it — the home screen's
 * line-up of sets — each moved by its own style on an inner layer, so the
 * outer layer's placement on the middle tile is never disturbed.
 */
export interface ShowcaseFigure {
  key: string | number;
  color: string;
  /** The outfit it wears, drawn in its own colours, `color` on its trims only. */
  outfit?: string;
  style?: React.CSSProperties;
  /** Drawn behind the stand rather than standing on it. */
  behind?: boolean;
}

interface CharacterShowcaseProps {
  color: string;
  /** The outfit the single fighter wears, drawn in its own colours. */
  outfit?: string;
  /** Replaces the single fighter in `color` when given. */
  figures?: ShowcaseFigure[];
  /** Sizes the stand; the fighter is scaled to whatever width it ends up. */
  className?: string;
  /** The fighter's height in tiles; larger makes it the star of the stand. */
  figureScale?: number;
  /** The grimoire's circle under the fighter, as an "element/sheet" fx key. */
  glyph?: string;
  /** The colour of a talisman circling the fighter, its ultimate ready. */
  talisman?: string;
  /** Which talisman it is, drawn as its relic when it is a legendary's. */
  talismanId?: string;
  /** A spell the single fighter casts on the stand. */
  cast?: ShowcaseCast | null;
}

/**
 * The player's fighter, idling on a few cells of the arena. The sprite is
 * sized from the stand's rendered width with the board's own arithmetic, so
 * it stands on the middle tile at any size.
 */
export const CharacterShowcase: React.FC<CharacterShowcaseProps> = ({
  color,
  outfit,
  figures,
  className = "",
  figureScale = 1.7,
  glyph,
  talisman,
  talismanId,
  cast,
}) => {
  const manifest = useFxManifest();
  // The fighter strikes the spell's pose for as long as its frames last, then
  // goes back to idling while the spell plays out.
  const [pose, setPose] = useState<"AttackMelee" | "AttackRanged" | null>(null);
  useEffect(() => {
    const hero = cast?.spell.hero;
    if (!hero) return;
    setPose(hero);
    const id = window.setTimeout(() => setPose(null), POSE_FOR);
    return () => window.clearTimeout(id);
  }, [cast]);
  const glyphSheet = glyph && manifest ? sheetOf(manifest, glyph) : undefined;
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const tile = (STAND.tileWidth * stage.offsetWidth) / STAND.viewBox.width;
      if (tile > 0) setScale((tile / 256) * figureScale);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [figureScale]);

  return (
    <div ref={stageRef} className={`relative ${className}`}>
      <CharacterStand className="relative z-[1] block w-full" />
      {glyphSheet && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[1]"
          style={{ left: `${STAND.origin.x * 100}%`, top: `${STAND.origin.y * 100}%` }}
        >
          <div
            style={{
              transform: `translate(${-glyphSheet.anchor[0] * scale}px, ${-glyphSheet.anchor[1] * scale}px)`,
            }}
          >
            <SpriteAnimation
              spriteSheet={FX_ROOT + glyphSheet.file}
              framesPerDirection={glyphSheet.frames}
              frameWidth={glyphSheet.frameWidth}
              frameHeight={glyphSheet.frameHeight}
              directionMap={GLYPH_ROWS}
              direction="S"
              scale={scale}
            />
          </div>
        </div>
      )}
      {(figures ?? [{ key: "only", color, outfit }]).map((figure) => (
        <div
          key={figure.key}
          className="pointer-events-none absolute"
          style={{
            // Feet on the middle tile, by the board's own arithmetic.
            left: `${STAND.origin.x * 100}%`,
            top: `${STAND.origin.y * 100}%`,
            transform: `translate(-50%, -${(pose && figure.outfit && !figures ? 246 / 384 : STAND.feet) * 100}%)`,
            zIndex: figure.behind ? 0 : 2,
          }}
        >
          <div style={figure.style}>
            <SpriteAnimation
              {...(pose && figure.outfit && !figures ? ATTACK : idle)}
              spriteSheet={
                figure.outfit
                  ? outfitSheet(figure.outfit, pose && !figures ? pose : "Idle")
                  : idle.spriteSheet
              }
              direction={pose && figure.outfit && !figures ? "SE" : "S"}
              scale={scale}
              color={figure.outfit ? undefined : figure.color}
            />
          </div>
        </div>
      ))}
      {manifest && cast !== undefined && (
        <StandFx manifest={manifest} cast={cast ?? null} stageRef={stageRef} scale={scale} />
      )}
      {talisman && (
        <div
          className="pointer-events-none absolute z-[3]"
          style={{ left: `${STAND.origin.x * 100}%`, top: `${STAND.origin.y * 100}%` }}
        >
          <TalismanOrbit
            x={0}
            y={-256 * scale * (SPRITE.feet - SPRITE.headTop) * 0.45}
            radius={256 * scale * 0.2}
            size={Math.max(7, 256 * scale * 0.065)}
            color={talisman}
            id={talismanId}
            unit={4 * scale}
          />
        </div>
      )}
    </div>
  );
};

/**
 * The grimoire's sheets played on the stand: two canvases a size larger than
 * the stand, so a meteor has room to fall, one under the fighter and one over
 * it, laid out so the stand's middle tile is the board's 0,0.
 */
const StandFx: React.FC<{
  manifest: FxManifest;
  cast: ShowcaseCast | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
}> = ({ manifest, cast, stageRef, scale }) => {
  const groundRef = useRef<HTMLCanvasElement>(null);
  const airRef = useRef<HTMLCanvasElement>(null);
  const sheets = useRef<SheetFx | null>(null);
  if (!sheets.current) sheets.current = new SheetFx(manifest);

  useEffect(() => {
    const stage = stageRef.current;
    const ground = groundRef.current;
    const air = airRef.current;
    const fx = sheets.current;
    if (!cast || !stage || !ground || !air || !fx) return;

    // The canvases reach one stand to either side and above: see the styles.
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    for (const c of [ground, air]) {
      c.width = w * 3;
      c.height = h * 3;
    }
    const tile = (STAND.tileWidth * w) / STAND.viewBox.width;
    fx.resize(
      {
        tileSize: { width: tile, height: tile / 2 },
        centerX: w + STAND.origin.x * w,
        centerY: 2 * h + STAND.origin.y * h,
      },
      scale
    );
    fx.reset();
    fx.play({ spell: cast.spell, origin: { x: 0, y: 0 }, target: cast.target, area: cast.area });

    let raf = 0;
    const step = () => {
      const g = ground.getContext("2d");
      const a = air.getContext("2d");
      if (!g || !a) return;
      g.clearRect(0, 0, ground.width, ground.height);
      a.clearRect(0, 0, air.width, air.height);
      g.imageSmoothingEnabled = false;
      a.imageSmoothingEnabled = false;
      fx.frame(performance.now(), g, a);
      if (fx.busy) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cast, stageRef, scale]);

  const box: React.CSSProperties = {
    position: "absolute",
    left: "-100%",
    top: "-200%",
    width: "300%",
    height: "300%",
    pointerEvents: "none",
  };
  return (
    <>
      <canvas ref={groundRef} aria-hidden style={{ ...box, zIndex: 1 }} />
      <canvas ref={airRef} aria-hidden style={{ ...box, zIndex: 3 }} />
    </>
  );
};

/** A ground sheet has one row, whichever way the fighter faces. */
const GLYPH_ROWS = { S: 0 } as const;

export default CharacterShowcase;
