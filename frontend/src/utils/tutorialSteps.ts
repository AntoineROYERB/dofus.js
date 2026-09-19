import { GAME_STATUS, GameStatus } from "../types/game";

/**
 * Everything the tour needs to know about a match, pulled out of the game
 * state so the steps below can be decided — and tested — without a DOM.
 */
export interface TutorialFacts {
  status: GameStatus;
  hasPositioned: boolean;
  isMyTurn: boolean;
  movementPoints: number;
  maxMovementPoints: number;
  /** The opponent's health, which is how a landed spell announces itself. */
  opponentHealth: number;
  /** How many times a spell's own description has been opened. */
  peeks: number;
  /**
   * Whether any spell on the bar could be cast at all right now — enough
   * action points, off cooldown, unlocked, not already spent this fight.
   */
  canCast: boolean;
  /** Whether the opponent is the tutorial's: standing still, not fighting. */
  opponentIsDummy: boolean;
  turnNumber: number;
}

/**
 * Every cell the player could click at this moment, as the board marks them.
 * No card may sit on one of these: whichever step is open, the board under it
 * is where the answer has to be given.
 */
export const LIVE_CELLS = "[data-live-cell]";

export type TutorialStepId =
  | "welcome"
  | "place"
  | "walk"
  | "peek"
  | "cast"
  | "endTurn"
  | "done";

export interface TutorialStep {
  id: TutorialStepId;
  /** The element to spotlight, or null for a card in the middle. */
  targetId: string | null;
  /**
   * A second element the step also needs lit. Placing yourself means picking
   * a cell *and* pressing Fight: dimming the button while the card tells you
   * to press it is how a tutorial teaches a player that it is lying to them.
   */
  alsoId?: string;
  title: string;
  /**
   * The objective. A finger and a cursor are told different things — there is
   * no hovering on a phone, and no number keys either — but they are the same
   * five objectives either way.
   */
  body: (touch: boolean) => string;
  /**
   * Whether the game will accept the objective yet. While this is false the
   * card says what it is waiting for instead of asking for something the
   * server would refuse.
   */
  ready?: (now: TutorialFacts) => boolean;
  /** What the card says while `ready` is false. */
  waiting?: string;
  /**
   * The turn has run out of what the objective needs — no points left to walk
   * with, no spell left to cast. The objective is not failed and not skipped;
   * it simply cannot be met until the next turn, and the only useful thing to
   * say is how to get there.
   */
  stalled?: {
    when: (now: TutorialFacts) => boolean;
    title: string;
    body: (touch: boolean) => string;
    /** Where to point while it holds: the way to the next turn. */
    targetId: string;
  };
  /**
   * What this step says instead when the opponent has been standing still —
   * which, for the closing card, is the difference between "off you go" and
   * "the fight you were shown has not started yet".
   */
  againstDummy?: {
    title: string;
    body: (touch: boolean) => string;
    /** What the button says, since it now does something to the match. */
    cta: string;
  };
  /**
   * Whether the player has done it, judged against the facts as they stood
   * when the step opened. A step with no test waits for its button instead.
   */
  done?: (now: TutorialFacts, opened: TutorialFacts) => boolean;
}

const myTurn = (now: TutorialFacts) =>
  now.status === GAME_STATUS.PLAYING && now.isMyTurn;

const WAIT_FOR_TURN = "Your opponent is taking its turn. Yours is next.";

/**
 * Five things to do, in the order a fight asks for them. Every one of them is
 * an action in the real game: the tour only ever gets out of the way and says
 * what to try next, which is why none of these steps has a "Next" button.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    targetId: null,
    title: "Learn it by fighting",
    body: () =>
      "You are in a real match against the computer. Five things to try, about a minute — leave whenever you like.",
  },
  {
    id: "place",
    targetId: "tutorial-board",
    alsoId: "tutorial-mainbutton",
    title: "Pick your ground",
    body: (touch) =>
      touch
        ? "Tap one of the green cells to stand there, then press Fight."
        : "Click one of the green cells to stand there, then press Fight.",
    ready: (now) => now.status === GAME_STATUS.POSITION_CHARACTERS,
    waiting: "Waiting for the board…",
    done: (now) => now.hasPositioned,
  },
  {
    id: "walk",
    targetId: "tutorial-board",
    title: "Walk",
    body: (touch) =>
      touch
        ? "Tap a nearby cell to preview the walk, then tap it again to go. Every cell costs one MP."
        : "Click a nearby cell to walk there. Every cell costs one MP — the green number on your fighter.",
    ready: myTurn,
    waiting: WAIT_FOR_TURN,
    done: (now, opened) =>
      now.movementPoints < opened.movementPoints ||
      (myTurn(now) && now.movementPoints < now.maxMovementPoints),
    stalled: {
      when: (now) => myTurn(now) && now.movementPoints === 0,
      title: "Out of movement",
      body: (touch) =>
        touch
          ? "No movement points left to walk with. End your turn — everything refills on your next one."
          : "No movement points left to walk with. End your turn — the button, or the Tab key. Everything refills on your next one.",
      targetId: "tutorial-mainbutton",
    },
  },
  {
    id: "peek",
    targetId: "tutorial-spellbar",
    title: "Read a spell",
    body: (touch) =>
      touch
        ? "Hold a spell for a moment: what it costs, what it does, how far it reaches. Holding never casts it."
        : "Hover a spell to read what it costs, what it does and how far it reaches.",
    done: (now, opened) => now.peeks > opened.peeks,
  },
  {
    id: "cast",
    targetId: "tutorial-spellbar",
    alsoId: "tutorial-board",
    title: "Cast it",
    body: (touch) =>
      touch
        ? "Tap a spell, then tap your opponent. It costs AP — the blue number."
        : "Pick a spell — click it, or press its number key — then click your opponent. It costs AP, the blue number.",
    ready: myTurn,
    waiting: WAIT_FOR_TURN,
    done: (now, opened) => now.opponentHealth < opened.opponentHealth,
    stalled: {
      when: (now) => myTurn(now) && !now.canCast,
      title: "Nothing left to cast",
      body: (touch) =>
        touch
          ? "No spell you can afford right now. End your turn — everything refills on your next one."
          : "No spell you can afford right now. End your turn — the button, or the Tab key. Everything refills on your next one.",
      targetId: "tutorial-mainbutton",
    },
  },
  {
    id: "endTurn",
    targetId: "tutorial-mainbutton",
    title: "Hand it over",
    body: (touch) =>
      touch
        ? "Out of points, or just done? End your turn. Everything refills on your next one."
        : "Out of points, or just done? End your turn — the button, or the Tab key. Everything refills on your next one.",
    ready: myTurn,
    waiting: WAIT_FOR_TURN,
    done: (now, opened) =>
      now.turnNumber > opened.turnNumber || (opened.isMyTurn && !now.isMyTurn),
  },
  {
    id: "done",
    targetId: null,
    title: "That is the whole game",
    body: () =>
      "Bring the other one to zero health and you win. This fight carries on from here — it was never a rehearsal.",
    againstDummy: {
      title: "Now the real thing",
      body: () =>
        "Your opponent has been standing still while you found the buttons. Wake it up and it will fight back, in this same match.",
      cta: "Wake your opponent",
    },
  },
];

/**
 * Whether the turn has run dry of what this step needs. The step stays open —
 * the objective is still ahead — but the card stops asking for something the
 * turn can no longer give.
 */
export const isStepStalled = (
  step: TutorialStep,
  now: TutorialFacts
): boolean => (step.stalled ? step.stalled.when(now) : false);

/** Whether the game is in a state where this step can be acted on. */
export const isStepReady = (step: TutorialStep, now: TutorialFacts): boolean =>
  step.ready ? step.ready(now) : true;

/**
 * Whether the step's objective has been met. A step is only ever satisfied by
 * an action, never by time passing, so this is the one way the tour advances.
 */
export const isStepDone = (
  step: TutorialStep,
  now: TutorialFacts,
  opened: TutorialFacts
): boolean => (step.done ? step.done(now, opened) : false);

/**
 * Whether the tour should stand down: a finished fight has its own screen,
 * and a card still asking for a spell over the result is noise. The step it
 * was on is kept, so a rematch picks the tour back up where it stopped.
 */
export const tourIsOver = (now: TutorialFacts): boolean =>
  now.status === GAME_STATUS.GAME_OVER;

/** The steps that ask for something, which is what the counter counts. */
export const OBJECTIVE_COUNT = TUTORIAL_STEPS.filter((s) => !!s.done).length;

/** How many objectives come before this step, so a card can number itself. */
export const objectivesBefore = (index: number): number =>
  TUTORIAL_STEPS.slice(0, index).filter((s) => !!s.done).length;

/**
 * Where the tour picks back up, given the step this device last reached.
 *
 * Two things can go wrong with a remembered step, and both land here. It can
 * name nothing the tour has any more — cleared site data, an older build, a
 * step since renamed — in which case the tour starts at the top. Or it can be
 * ahead of the match it is resumed into: the steps are remembered across
 * matches, so a player who left at "cast" and comes back to a board still
 * waiting to be stood on has to be told to stand on it first. A tour that
 * skips the placement step leaves that player looking at a board that will
 * not move until they press a button nothing has mentioned.
 */
export const resumeIndex = (
  lastStep: TutorialStepId | null,
  hasPositioned: boolean
): number => {
  const remembered = TUTORIAL_STEPS.findIndex((s) => s.id === lastStep);
  if (remembered <= 0) return 0;
  const place = TUTORIAL_STEPS.findIndex((s) => s.id === "place");
  return hasPositioned ? remembered : Math.min(remembered, place);
};
