import React, { useLayoutEffect, useState } from "react";

interface GameTutorialProps {
  active: boolean;
  onFinish: () => void;
}

interface Step {
  /** DOM id of the element to spotlight, or null to show a centered card. */
  targetId: string | null;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    targetId: null,
    title: "Welcome to Dofus.js",
    body: "A quick 5-step tour of the battlefield. You can skip it any time, and replay it later from the room panel.",
  },
  {
    targetId: "tutorial-board",
    title: "The board",
    body: "A 15×15 isometric grid. Click a cell to walk there, or — before the fight starts — to choose where you stand.",
  },
  {
    targetId: "tutorial-fighter-panel",
    title: "Your fighter",
    body: "Health (HP), action points (AP) and movement points (MP). Every move or spell spends points; they refill at the start of your next turn.",
  },
  {
    targetId: "tutorial-spellbar",
    title: "Spells",
    body: "Pick a spell — click it or press its number key — then click a cell to cast it there. Each spell costs AP and has its own range.",
  },
  {
    targetId: "tutorial-mainbutton",
    title: "Ending your turn",
    body: "Out of moves, or just done? End your turn here. Each turn runs on a 45-second clock, so nobody can stall the match.",
  },
  {
    targetId: null,
    title: "That's it",
    body: "You know enough to fight. Good luck out there.",
  },
];

const PADDING = 8;
// A conservative upper bound on the card's rendered height, used to keep it
// on-screen without waiting a render cycle to measure the real thing.
const CARD_HEIGHT_ESTIMATE = 230;
const CARD_WIDTH = 320;

/**
 * A spotlight tour laid over a real match rather than a fake board: it dims
 * the screen and cuts a hole around the element each step talks about, but
 * never blocks a click — the game underneath stays fully playable while it
 * runs. Steps with no target (welcome, goodbye) show a centered card instead.
 */
export const GameTutorial: React.FC<GameTutorialProps> = ({
  active,
  onFinish,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[stepIndex];

  useLayoutEffect(() => {
    if (!active) return;
    if (!step.targetId) {
      setRect(null);
      return;
    }

    const measure = () => {
      const el = document.getElementById(step.targetId as string);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, step.targetId]);

  if (!active) return null;

  const isLast = stepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onFinish();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => setStepIndex((prev) => Math.max(0, prev - 1));

  // Below the spotlighted element when there's room, above it when there
  // isn't, and pinned inside the viewport when the element is too tall for
  // either — a card positioned by percentage transform instead of a measured
  // height can end up pushed off-screen entirely for a target as big as the
  // board, so every branch below clamps to an absolute pixel position.
  const cardStyle: React.CSSProperties = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        let top: number;
        if (spaceBelow >= CARD_HEIGHT_ESTIMATE + 16) {
          top = rect.bottom + 16;
        } else if (spaceAbove >= CARD_HEIGHT_ESTIMATE + 16) {
          top = rect.top - 16 - CARD_HEIGHT_ESTIMATE;
        } else {
          top = Math.max(
            16,
            Math.min(rect.top, window.innerHeight - CARD_HEIGHT_ESTIMATE - 16)
          );
        }
        const left = Math.min(
          Math.max(16, rect.left),
          window.innerWidth - CARD_WIDTH - 16
        );
        return { top, left };
      })()
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-sm border-2 border-vermilion transition-all duration-200"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(20, 16, 12, 0.6)",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-ink/60"
        />
      )}

      <div
        className="pointer-events-auto fixed w-[300px] border-2 border-ink bg-paper p-4 text-ink shadow-lg sm:w-[320px]"
        style={cardStyle}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            Tour · {stepIndex + 1}/{STEPS.length}
          </span>
          <button
            type="button"
            onClick={onFinish}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Skip tutorial
          </button>
        </div>

        <h3 className="mt-2 font-display text-[18px] font-bold leading-tight">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
          {step.body}
        </p>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-0"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="border border-ink bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-paper transition-colors hover:bg-vermilion hover:border-vermilion"
          >
            {isLast ? "Start playing" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameTutorial;
