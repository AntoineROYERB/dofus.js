import React, { useEffect, useRef, useState } from "react";
import { CloseButton } from "./Overlay";
import { useBackdropTap } from "../hooks/useDismiss";
import { BOARD } from "../constants";
import { t } from "../i18n/lang";
import { useT } from "../i18n/LanguageProvider";
import { Rich } from "../i18n/Rich";

interface HowToPlayDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Start the guided match. Left out — on a screen with no way into a game —
   * the dialog is the rules alone, as it always was.
   */
  onPlayTutorial?: () => void;
}

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <section className="border-t border-hairline pt-3">
    <h3 className="font-mono text-[9.5px] uppercase tracking-label text-muted">
      {label}
    </h3>
    <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-graphite">
      {children}
    </div>
  </section>
);

/** A tiny 5×5 grid a diagram can draw a character, a path or a spell on. */
const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 250 250" className="mx-auto w-full max-w-[220px]">
    <rect width="250" height="250" fill={BOARD.tile} stroke={BOARD.stroke} />
    {Array.from({ length: 4 }, (_, i) => (
      <React.Fragment key={i}>
        <line
          x1={(i + 1) * 50}
          y1={0}
          x2={(i + 1) * 50}
          y2={250}
          stroke={BOARD.tileAlt}
        />
        <line
          x1={0}
          y1={(i + 1) * 50}
          x2={250}
          y2={(i + 1) * 50}
          stroke={BOARD.tileAlt}
        />
      </React.Fragment>
    ))}
    {children}
  </svg>
);

const cell = (col: number, row: number) => ({ x: col * 50, y: row * 50 });

/** Movement: three steps costs three MP, one cell at a time. */
const MovementDiagram: React.FC = () => {
  const path = [cell(0, 2), cell(1, 2), cell(2, 2), cell(3, 2)];
  return (
    <Grid>
      {path.slice(0, -1).map((p, i) => (
        <rect
          key={i}
          x={p.x + 4}
          y={p.y + 4}
          width={42}
          height={42}
          fill={BOARD.socle.out}
          fillOpacity={0.18}
        />
      ))}
      <circle cx={path[0].x + 25} cy={path[0].y + 25} r={16} fill={BOARD.socle.mine} />
      <circle
        cx={path[path.length - 1].x + 25}
        cy={path[path.length - 1].y + 25}
        r={16}
        fill="none"
        stroke={BOARD.accent}
        strokeWidth={2.5}
        strokeDasharray="4 3"
      />
      <text x="125" y="235" textAnchor="middle" fontSize="13" fill="#bec7ec">
        {t("3 cells walked = 3 MP spent")}
      </text>
    </Grid>
  );
};

/** A spell's range (the cells it can target) and its area once it lands. */
const SpellRangeDiagram: React.FC = () => {
  const caster = cell(0, 2);
  const target = cell(3, 2);
  const area = [cell(3, 1), cell(2, 2), cell(3, 2), cell(4, 2), cell(3, 3)];
  return (
    <Grid>
      {[cell(1, 2), cell(2, 2), cell(3, 2)].map((p, i) => (
        <rect
          key={i}
          x={p.x + 4}
          y={p.y + 4}
          width={42}
          height={42}
          fill={BOARD.accent}
          fillOpacity={0.08}
        />
      ))}
      {area.map((p, i) => (
        <rect
          key={i}
          x={p.x + 4}
          y={p.y + 4}
          width={42}
          height={42}
          fill={BOARD.accent}
          fillOpacity={0.3}
        />
      ))}
      <circle cx={caster.x + 25} cy={caster.y + 25} r={16} fill={BOARD.socle.mine} />
      <circle cx={target.x + 25} cy={target.y + 25} r={6} fill={BOARD.accent} />
      <text x="125" y="235" textAnchor="middle" fontSize="13" fill="#bec7ec">
        {t("Range, then the shape it hits")}
      </text>
    </Grid>
  );
};

/**
 * Two ways to learn the game, and the played one comes first: a guided match
 * against the computer for someone who has never seen a turn-based tactics
 * game, and a page of rules for someone who has and just wants the specifics.
 * Reading was the only option here for a long time, which meant the people who
 * needed it most were the ones asked to do the most work before playing.
 */
export const HowToPlayDialog: React.FC<HowToPlayDialogProps> = ({
  open,
  onClose,
  onPlayTutorial,
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropTap(onClose);
  const [reading, setReading] = useState(!onPlayTutorial);
  useT();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    // Opening always lands on the choice, never on wherever it was left.
    if (open) setReading(!onPlayTutorial);
  }, [open, onPlayTutorial]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A tap on the backdrop lands on the dialog itself, never on its panel.
      {...backdrop}
      className="m-0 max-h-none h-full w-full max-w-none bg-paper p-0 text-ink backdrop:bg-night/70 sm:mx-auto sm:my-[6vh] sm:h-auto sm:max-h-[88vh] sm:w-[min(560px,92vw)] sm:rounded-3xl sm:border-2 sm:border-gold/70 short:my-0 short:h-full short:max-h-full short:w-[min(640px,100vw)] short:border-y-0"
    >
      <div className="flex h-full max-h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-gold/40 pl-5 pr-2 pt-[max(0.25rem,env(safe-area-inset-top))] sm:pl-7 sm:pr-3 sm:pt-1">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            {t("How to play")}
          </span>
          <CloseButton onClick={onClose} />
        </div>

        {!reading ? (
          // Centred with auto margins rather than justify-center, which on a
          // screen shorter than the choice pushed its title up under the
          // header instead of letting it scroll.
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-7 sm:px-7 short:py-4">
            <div className="my-auto">
              <h2 className="font-display text-[30px] font-bold leading-none tracking-tight">
                {t("Learn it, or read it")}
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
                {t("Two fighters, one grid, turns until one side falls. Whichever of these you pick takes about a minute.")}
              </p>

              {/* Side by side on a phone held sideways, where two stacked did not fit. */}
              <div className="mt-6 flex flex-col gap-3 short:mt-4 short:grid short:grid-cols-2">
                <button
                  type="button"
                  onClick={onPlayTutorial}
                  className="w-full btn-gold rounded-2xl px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <span className="block font-display text-[17px] font-bold leading-none">
                    {t("Play the tutorial")}
                  </span>
                  <span className="mt-1.5 block text-[12.5px] leading-snug text-[#2a1b00]/80 [text-shadow:none]">
                    {t("A real match against the computer, with five things to try. You learn by doing them.")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReading(true)}
                  className="w-full border border-ink px-4 py-4 text-left transition-colors hover:border-vermilion hover:text-vermilion"
                >
                  <span className="block font-display text-[17px] font-bold leading-none">
                    {t("Just the rules")}
                  </span>
                  <span className="mt-1.5 block text-[12.5px] leading-snug text-graphite">
                    {t("Points, spells and what wins a fight, on one page — if you have played something like this before.")}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <h2 className="font-display text-[30px] font-bold leading-none tracking-tight">
              {t("The rules, in short")}
            </h2>

            <div className="mt-6 space-y-5">
              <Section label={t("The goal")}>
                <p>
                  {t("Two fighters, one grid, turns until one side falls. Bring your opponent's health to zero before they do the same to you — everything else is how you get there.")}
                </p>
              </Section>

              <Section label={t("Turns and points")}>
                <p>
                  <Rich text={t("On your turn you get <b>action points (AP)</b> to cast spells and <b>movement points (MP)</b> to walk. Spend either, both, or neither, then end your turn (Space, on a keyboard; H lists every key); points refill at the start of your next one, and a turn runs on a 45-second clock.")} />
                </p>
                <MovementDiagram />
              </Section>

              <Section label={t("Spells")}>
                <p>
                  <Rich text={t("Each spell has a <b>range</b> and an <b>AP cost</b>. Pick one — tap it, click it, or press its number key — then pick a cell in range. Some hit a wider area once they land, and some leave fire, ice or traps behind for the rest of the fight.")} />
                </p>
                <SpellRangeDiagram />
                <p>
                  <Rich text={t("Hold a spell on a phone, or hover it on a desk, to read what it does. The gold one is your <b>ultimate</b>: it unlocks on turn 2 and can be cast once a fight.")} />
                </p>
              </Section>
            </div>
          </div>
        )}

        {reading && (
          <div className="flex flex-none items-center justify-between gap-4 border-t border-gold/40 px-5 py-3 sm:px-7">
            {onPlayTutorial ? (
              <button
                type="button"
                onClick={onPlayTutorial}
                className="font-mono text-[9.5px] uppercase tracking-label text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
              >
                {t("Play the tutorial instead")}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink bg-ink px-5 py-2 font-mono text-[10px] uppercase tracking-label text-paper transition-colors hover:bg-vermilion hover:border-vermilion"
            >
              {t("Got it")}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default HowToPlayDialog;
