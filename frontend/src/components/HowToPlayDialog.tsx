import React, { useEffect, useRef, useState } from "react";

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
    <rect width="250" height="250" fill="#ffffff" stroke="#cfd0cd" />
    {Array.from({ length: 4 }, (_, i) => (
      <React.Fragment key={i}>
        <line
          x1={(i + 1) * 50}
          y1={0}
          x2={(i + 1) * 50}
          y2={250}
          stroke="#e2e3e0"
        />
        <line
          x1={0}
          y1={(i + 1) * 50}
          x2={250}
          y2={(i + 1) * 50}
          stroke="#e2e3e0"
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
          fill="#8b8d8a"
          fillOpacity={0.18}
        />
      ))}
      <circle cx={path[0].x + 25} cy={path[0].y + 25} r={16} fill="#17181a" />
      <circle
        cx={path[path.length - 1].x + 25}
        cy={path[path.length - 1].y + 25}
        r={16}
        fill="none"
        stroke="#d1462f"
        strokeWidth={2.5}
        strokeDasharray="4 3"
      />
      <text x="125" y="235" textAnchor="middle" fontSize="13" fill="#5f6260">
        3 cells walked = 3 MP spent
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
          fill="#d1462f"
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
          fill="#d1462f"
          fillOpacity={0.3}
        />
      ))}
      <circle cx={caster.x + 25} cy={caster.y + 25} r={16} fill="#17181a" />
      <circle cx={target.x + 25} cy={target.y + 25} r={6} fill="#d1462f" />
      <text x="125" y="235" textAnchor="middle" fontSize="13" fill="#5f6260">
        Range, then the shape it hits
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
  const [reading, setReading] = useState(!onPlayTutorial);

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
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-0 max-h-none h-full w-full max-w-none bg-paper p-0 text-ink backdrop:bg-ink/50 sm:mx-auto sm:my-[6vh] sm:h-auto sm:max-h-[88vh] sm:w-[min(560px,92vw)] sm:border-2 sm:border-ink"
    >
      <div className="flex h-full max-h-full flex-col">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink px-5 pb-2 pt-4 sm:px-7">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            How to play
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Close
          </button>
        </div>

        {!reading ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-7 sm:px-7">
            <h2 className="font-display text-[30px] font-bold leading-none tracking-tight">
              Learn it, or read it
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
              Two fighters, one grid, turns until one side falls. Whichever of
              these you pick takes about a minute.
            </p>

            <button
              type="button"
              onClick={onPlayTutorial}
              className="mt-6 w-full bg-vermilion px-4 py-4 text-left text-white transition-colors hover:bg-[#b93a25] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="block font-display text-[17px] font-bold leading-none">
                Play the tutorial
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-snug text-white/85">
                A real match against the computer, with five things to try. You
                learn by doing them.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setReading(true)}
              className="mt-3 w-full border border-ink px-4 py-4 text-left transition-colors hover:border-vermilion hover:text-vermilion"
            >
              <span className="block font-display text-[17px] font-bold leading-none">
                Just the rules
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-snug text-graphite">
                Points, spells and what wins a fight, on one page — if you have
                played something like this before.
              </span>
            </button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <h2 className="font-display text-[30px] font-bold leading-none tracking-tight">
              The rules, in short
            </h2>

            <div className="mt-6 space-y-5">
              <Section label="The goal">
                <p>
                  Two fighters, one grid, turns until one side falls. Bring your
                  opponent&apos;s health to zero before they do the same to you
                  — everything else is how you get there.
                </p>
              </Section>

              <Section label="Turns and points">
                <p>
                  On your turn you get{" "}
                  <b className="text-ink">action points (AP)</b> to cast spells
                  and <b className="text-ink">movement points (MP)</b> to walk.
                  Spend either, both, or neither, then end your turn; points
                  refill at the start of your next one, and a turn runs on a
                  45-second clock.
                </p>
                <MovementDiagram />
              </Section>

              <Section label="Spells">
                <p>
                  Each spell has a <b className="text-ink">range</b> and an{" "}
                  <b className="text-ink">AP cost</b>. Pick one — tap it, click
                  it, or press its number key — then pick a cell in range. Some
                  hit a wider area once they land, and some leave fire, ice or
                  traps behind for the rest of the fight.
                </p>
                <SpellRangeDiagram />
                <p>
                  Hold a spell on a phone, or hover it on a desk, to read what
                  it does. The gold one is your{" "}
                  <b className="text-ink">ultimate</b>: it unlocks on turn 2 and
                  can be cast once a fight.
                </p>
              </Section>
            </div>
          </div>
        )}

        {reading && (
          <div className="flex flex-none items-center justify-between gap-4 border-t-2 border-ink px-5 py-3 sm:px-7">
            {onPlayTutorial ? (
              <button
                type="button"
                onClick={onPlayTutorial}
                className="font-mono text-[9.5px] uppercase tracking-label text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
              >
                Play the tutorial instead
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="border border-ink bg-ink px-5 py-2 font-mono text-[10px] uppercase tracking-label text-paper transition-colors hover:bg-vermilion hover:border-vermilion"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default HowToPlayDialog;
