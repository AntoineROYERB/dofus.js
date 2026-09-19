import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  OBJECTIVE_COUNT,
  TUTORIAL_STEPS,
  TutorialFacts,
  LIVE_CELLS,
  isStepDone,
  isStepReady,
  isStepStalled,
  objectivesBefore,
  tourIsOver,
} from "../../utils/tutorialSteps";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { prefersReducedMotion } from "../../utils/motion";
import {
  Box,
  Spot,
  boxAround,
  fillsScreen,
  hasArea,
  placeCard,
} from "../../utils/spotlight";

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
/*
 * The arrow's bob. It is the only thing moving on a screen the player is
 * being asked to read, which is what makes it noticed — and it is also the
 * one piece of the tour that a player who asked for less motion would want
 * stilled. It goes through the project's single switch rather than reading
 * the media query itself, so the tour says the same thing about motion as
 * the board does; today that switch ships the animation (see utils/motion).
 */
const NUDGE = prefersReducedMotion() ? "" : "animate-nudge";
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
  const [rect, setRect] = useState<Box | null>(null);
  const [alsoRect, setAlsoRect] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({
    width: CARD_WIDTH,
    height: CARD_HEIGHT_ESTIMATE,
  });
  const [liveCells, setLiveCells] = useState<Box[]>([]);
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
  // The turn has nothing left for this objective. The step stays open and the
  // card points at the way to the next turn instead.
  const stalled = !done && isStepStalled(step, facts);
  // The closing card has something else to say when the opponent has been
  // standing still through the whole tour.
  const dummy = facts.opponentIsDummy ? step.againstDummy : undefined;

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
    const own = el.getBoundingClientRect();
    setCardSize({
      width: own.width || CARD_WIDTH,
      height: own.height || CARD_HEIGHT_ESTIMATE,
    });
  }, [active, stepIndex, ready, done, stuck, touch]);

  useLayoutEffect(() => {
    if (!active) return;

    const box = (id: string | undefined): Box | null => {
      const el = id ? document.getElementById(id) : null;
      if (!el) return null;
      const own = el.getBoundingClientRect();
      if (hasArea(own)) return own;
      // A wrapper whose children are all absolutely positioned has no box of
      // its own: what it holds is what to light.
      return boxAround(
        Array.from(el.children)
          .map((child) => child.getBoundingClientRect())
          .filter(hasArea)
      );
    };
    const measure = () => {
      const also = stalled ? null : box(step.alsoId);
      const target = stalled ? step.stalled?.targetId : step.targetId;
      setRect(target ? box(target) : null);
      setAlsoRect(also);
      /*
       * The card's own size, measured on the same beat as everything else.
       * It is not a constant: the card is narrower on a phone than on a
       * desktop and its text reflows at every width, so turning the phone
       * changes its height — and a card placed from the height it had in the
       * other orientation is the one hanging off the bottom of the screen.
       * The iOS web view settles late enough that this outlives the first
       * paint, which is why it is on the timer rather than only on resize.
       */
      const own = card.current?.getBoundingClientRect();
      if (own && own.width && own.height) {
        setCardSize((prev) =>
          Math.abs(prev.width - own.width) > 1 ||
          Math.abs(prev.height - own.height) > 1
            ? { width: own.width, height: own.height }
            : prev
        );
      }
      // Every cell the player could click right now, whichever step is open:
      // the board under the card is where the answer has to be given.
      setLiveCells(
        Array.from(document.querySelectorAll(LIVE_CELLS))
          .map((el) => el.getBoundingClientRect())
          .filter(hasArea)
      );
    };

    measure();
    const id = window.setInterval(measure, REMEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [active, step.targetId, step.alsoId, step.stalled?.targetId, stalled]);

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
  const spot: Spot = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        let top: number;
        if (spaceBelow >= cardSize.height + 16) {
          top = rect.bottom + 16;
          arrow = "up";
        } else if (spaceAbove >= cardSize.height + 16) {
          top = rect.top - 16 - cardSize.height;
          arrow = "down";
        } else {
          // The target is taller than the screen leaves room beside it — the
          // board. The card goes to the foot of it, out of the way of the
          // cells, which are spread over everything above.
          top = Math.max(
            16,
            Math.min(
              rect.bottom - cardSize.height - 16,
              window.innerHeight - cardSize.height - 16
            )
          );
        }

        // A board that is the whole screen — the phone held sideways — has no
        // foot to sit at: the bottom corners are where the fighter's points
        // and the spell arc live, and the card would cover the very numbers
        // it is talking about. There it goes to the top instead, between the
        // turn bar and the corner buttons.
        const fillsScreen = rect.bottom - rect.top > window.innerHeight * 0.85;
        if (fillsScreen) {
          return {
            top: Math.max(16, rect.top + 44),
            left: Math.max(16, (window.innerWidth - cardSize.width) / 2),
          };
        }

        const left = Math.min(
          Math.max(16, rect.left),
          window.innerWidth - cardSize.width - 16
        );
        return { top, left };
      })()
    : {
        top: Math.max(16, (window.innerHeight - cardSize.height) / 2),
        left: Math.max(16, (window.innerWidth - cardSize.width) / 2),
      };

  /*
   * Where the card ends up. A step that names something — the green cells to
   * start on — must not then sit on it, so the spot above is only a
   * preference: anything it would cover sends the card to the nearest corner
   * or edge that is clear, and the arrow goes with it, since it no longer
   * points from where it was drawn.
   */
  const lit = [rect, alsoRect].filter((box): box is Box => !!box);
  // Worth an outline: anything that is not already the whole screen.
  const worthOutlining = (box: Box) =>
    !fillsScreen(box, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

  const placed = placeCard(
    spot,
    cardSize,
    { width: window.innerWidth, height: window.innerHeight },
    // The cells are counted; what the step is lighting is not to be covered at
    // all — a card over the spell bar while it says "pick a spell" is worse
    // than a card over a corner of a range.
    { cells: liveCells, never: lit }
  );
  if (placed.top !== spot.top || placed.left !== spot.left) arrow = null;

  const cardStyle: React.CSSProperties = placed;


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
                width={box.right - box.left + PADDING * 2}
                height={box.bottom - box.top + PADDING * 2}
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

      {/*
        An outline around each lit element, except one as big as the screen:
        the board's own outline lies off every edge, so all it ever draws is a
        pair of red lines with nothing between them — clutter that stays put
        while the steps move on. The hole in the dim is what lights the board.

        No transition either. An outline that slides from the spell bar to the
        turn zone reads, for the length of the slide, as a third red box around
        everything in between.
      */}
      {lit.filter(worthOutlining).map((box, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none fixed rounded-sm border-2 border-vermilion"
          style={{
            top: box.top - PADDING,
            left: box.left - PADDING,
            width: box.right - box.left + PADDING * 2,
            height: box.bottom - box.top + PADDING * 2,
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
          className={`${NUDGE} pointer-events-none fixed font-mono text-[15px] leading-none text-vermilion`}
          /*
           * Above the thing it points at, unless there is no above: the phone
           * held sideways puts the turn zone within twenty-eight pixels of
           * the top edge, and an arrow drawn off the screen points at nothing.
           */
          style={{
            top: Math.max(4, alsoRect.top - PADDING - 20),
            left: Math.min(
              Math.max(4, (alsoRect.left + alsoRect.right) / 2 - 6),
              window.innerWidth - 16
            ),
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
            className={`absolute left-6 ${NUDGE} font-mono text-[15px] leading-none text-vermilion ${
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
          {stalled && step.stalled
            ? step.stalled.title
            : (dummy?.title ?? step.title)}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
          {!ready
            ? step.waiting
            : stalled && step.stalled
              ? step.stalled.body(touch)
              : (dummy?.body(touch) ?? step.body(touch))}
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
                {!ready ? "Waiting" : stalled ? "Next turn" : "Your move"}
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
              {dummy?.cta ?? (isLast ? "Back to the fight" : "Show me")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameTutorial;
