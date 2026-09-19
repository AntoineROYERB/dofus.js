import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  OBJECTIVE_COUNT,
  TUTORIAL_STEPS,
  TutorialFacts,
  isStepDone,
  isStepReady,
  objectivesBefore,
  tourIsOver,
} from "../../utils/tutorialSteps";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface GameTutorialProps {
  active: boolean;
  /** The match, as the tour reads it. */
  facts: TutorialFacts;
  /**
   * Which step is open. It is held by the screen rather than in here because
   * turning the phone swaps one whole layout for the other, which takes this
   * component with it — and a tour that restarts at step one every time the
   * phone turns is worse than no tour.
   */
  step: number;
  onStep: (step: number) => void;
  onFinish: () => void;
}

const PADDING = 8;
// What the card is assumed to be until it has been rendered once and measured.
// A card placed from an estimate alone floats well clear of the thing it is
// pointing at, which on a short screen means sitting over the board.
const CARD_HEIGHT_ESTIMATE = 230;
const CARD_WIDTH = 320;
// Long enough for the player to see what they just did land on the board.
const SETTLE_MS = 700;
// How long an objective goes unanswered before the card offers a way past it.
// Something can always go wrong — no movement points left, a spell the board
// refuses — and a tutorial nobody can leave is worse than no tutorial.
const STUCK_MS = 14000;
// The HUD moves under the tour: a sheet opens, the board re-fits, the phone
// turns. Re-measuring on a timer costs nothing and beats a stale hole.
const REMEASURE_MS = 400;

/**
 * The guided first match. It lays a dimmed screen over a real fight, cuts a
 * hole around the thing each step talks about, and — this is the whole point
 * — waits for the player to do that thing rather than for them to press
 * "Next". Nothing here is ever in the way: the hole is not clickable, the
 * game underneath stays fully playable, and every step can be skipped.
 */
export const GameTutorial: React.FC<GameTutorialProps> = ({
  active,
  facts,
  step: stepIndex,
  onStep,
  onFinish,
}) => {
  const touch = useMediaQuery("(hover: none) and (pointer: coarse)");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [alsoRect, setAlsoRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT_ESTIMATE);
  const [stuck, setStuck] = useState(false);
  const step = TUTORIAL_STEPS[stepIndex];
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  // The match as it stood when this step opened: every objective is judged
  // against it, so a spell cast two steps ago cannot satisfy this one.
  const opened = useRef(facts);
  useEffect(() => {
    opened.current = facts;
    setStuck(false);
    // Deliberately only on the step: this is the snapshot, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const ready = isStepReady(step, facts);
  const done = isStepDone(step, facts, opened.current);

  // Done, and a beat to take it in before the next card.
  useEffect(() => {
    if (!active || !done) return;
    const id = window.setTimeout(
      () => onStep(Math.min(stepIndex + 1, TUTORIAL_STEPS.length - 1)),
      SETTLE_MS
    );
    return () => window.clearTimeout(id);
    // onStep is rebuilt every render by the screen above; the step and the
    // objective being met are what should re-arm this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, done, stepIndex]);

  useEffect(() => {
    if (!active || !step.done) return;
    const id = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => window.clearTimeout(id);
  }, [active, step.done, stepIndex]);

  useLayoutEffect(() => {
    const el = card.current;
    if (!active || !el) return;
    setCardHeight(el.getBoundingClientRect().height || CARD_HEIGHT_ESTIMATE);
  }, [active, stepIndex, ready, done, stuck, touch]);

  useLayoutEffect(() => {
    if (!active) return;
    if (!step.targetId) {
      setRect(null);
      setAlsoRect(null);
      return;
    }

    const box = (id: string | undefined) => {
      const el = id ? document.getElementById(id) : null;
      return el ? el.getBoundingClientRect() : null;
    };
    const measure = () => {
      setRect(box(step.targetId as string));
      setAlsoRect(box(step.alsoId));
    };

    measure();
    const id = window.setInterval(measure, REMEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [active, step.targetId, step.alsoId]);

  if (!active || tourIsOver(facts)) return null;

  const advance = () => {
    if (isLast) {
      onFinish();
      return;
    }
    onStep(stepIndex + 1);
  };

  // Below the spotlighted element when there's room, above it when there
  // isn't, and pinned inside the viewport when the element is too tall for
  // either — a card positioned by percentage transform instead of a measured
  // height can end up pushed off-screen entirely for a target as big as the
  // board, so every branch below clamps to an absolute pixel position.
  let arrow: "up" | "down" | null = null;
  const cardStyle: React.CSSProperties = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        let top: number;
        if (spaceBelow >= cardHeight + 16) {
          top = rect.bottom + 16;
          arrow = "up";
        } else if (spaceAbove >= cardHeight + 16) {
          top = rect.top - 16 - cardHeight;
          arrow = "down";
        } else {
          // The target is taller than the screen leaves room beside it — the
          // board. The card goes to the foot of it, out of the way of the
          // cells, which are spread over everything above.
          top = Math.max(
            16,
            Math.min(
              rect.bottom - cardHeight - 16,
              window.innerHeight - cardHeight - 16
            )
          );
        }

        // A board that is the whole screen — the phone held sideways — has no
        // foot to sit at: the bottom corners are where the fighter's points
        // and the spell arc live, and the card would cover the very numbers
        // it is talking about. There it goes to the top instead, between the
        // turn bar and the corner buttons.
        const fillsScreen = rect.height > window.innerHeight * 0.85;
        if (fillsScreen) {
          return {
            top: Math.max(16, rect.top + 44),
            left: Math.max(16, (window.innerWidth - CARD_WIDTH) / 2),
          };
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

  const lit = [rect, alsoRect].filter((box): box is DOMRect => !!box);

  const objective = !!step.done;
  const counter = objective
    ? `Step ${objectivesBefore(stepIndex) + 1}/${OBJECTIVE_COUNT}`
    : "Tutorial";

  // Nothing here may take a click but the card: the root spans the screen, so
  // without pointer-events-none the tour would quietly swallow every tap on
  // the board it is asking the player to tap.
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50"
      role="dialog"
      aria-modal="false"
    >
      {/*
        The dim, with a hole cut for everything the step needs — which is more
        than one thing as soon as an objective takes two: a cell and the button
        that confirms it. A hole per element, rather than one shadow per
        element, because two of those shadows only darken each other's hole.
      */}
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full"
      >
        <defs>
          <mask id="tutorial-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {lit.map((box, i) => (
              <rect
                key={i}
                x={box.left - PADDING}
                y={box.top - PADDING}
                width={box.width + PADDING * 2}
                height={box.height + PADDING * 2}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          // Light enough that the fight stays readable through it: the player
          // is meant to be watching the board, not the card.
          fill={lit.length > 0 ? "rgba(20, 16, 12, 0.45)" : "rgba(20, 16, 12, 0.6)"}
          mask={lit.length > 0 ? "url(#tutorial-spotlight)" : undefined}
        />
      </svg>

      {lit.map((box, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none fixed rounded-sm border-2 border-vermilion transition-all duration-200"
          style={{
            top: box.top - PADDING,
            left: box.left - PADDING,
            width: box.width + PADDING * 2,
            height: box.height + PADDING * 2,
          }}
        />
      ))}

      {/*
        The companion gets the arrow the card cannot give it: on a step whose
        card sits inside the board, the button to press is the one thing a
        player has to be pointed at.
      */}
      {alsoRect && (
        <span
          aria-hidden
          className="animate-nudge pointer-events-none fixed font-mono text-[15px] leading-none text-vermilion"
          style={{
            top: alsoRect.top - PADDING - 20,
            left: alsoRect.left + alsoRect.width / 2 - 6,
          }}
        >
          ▼
        </span>
      )}

      <div
        ref={card}
        className="pointer-events-none fixed w-[300px] border-2 border-ink bg-paper/95 p-4 text-ink shadow-lg sm:w-[320px]"
        style={cardStyle}
      >
        {/* Which way the thing being talked about lies. */}
        {arrow && (
          <span
            aria-hidden
            className={`absolute left-6 animate-nudge font-mono text-[15px] leading-none text-vermilion ${
              arrow === "up" ? "-top-5" : "-bottom-5"
            }`}
          >
            {arrow === "up" ? "▲" : "▼"}
          </span>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
            {counter}
          </span>
          <button
            type="button"
            onClick={onFinish}
            className="pointer-events-auto font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion"
          >
            Skip tutorial
          </button>
        </div>

        <h3 className="mt-2 font-display text-[18px] font-bold leading-tight">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
          {ready ? step.body(touch) : step.waiting}
        </p>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          {/*
            An objective has no forward button: doing the thing is the button.
            The line on the left says so — and, if the game has left the player
            with no way to do it, turns into the way out.
          */}
          {objective ? (
            done ? (
              <span className="font-mono text-[9.5px] uppercase tracking-label text-vermilion">
                Done
              </span>
            ) : stuck ? (
              <button
                type="button"
                onClick={advance}
                className="pointer-events-auto font-mono text-[9.5px] uppercase tracking-label text-muted underline decoration-rule underline-offset-4 transition-colors hover:text-vermilion"
              >
                Skip this step
              </button>
            ) : (
              <span className="font-mono text-[9.5px] uppercase tracking-label text-muted">
                {ready ? "Your move" : "Waiting"}
              </span>
            )
          ) : (
            <span />
          )}

          {!objective && (
            <button
              type="button"
              onClick={advance}
              className="pointer-events-auto border border-ink bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-label text-paper transition-colors hover:bg-vermilion hover:border-vermilion"
            >
              {isLast ? "Back to the fight" : "Show me"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameTutorial;
