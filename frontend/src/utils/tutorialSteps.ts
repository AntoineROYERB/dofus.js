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
  turnNumber: number;
}

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
    title: "Pick your ground",
    body: (touch) =>
      touch
        ? "Tap one of the pulsing cells to stand there, then press Fight."
        : "Click one of the pulsing cells to stand there, then press Fight.",
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
    title: "Cast it",
    body: (touch) =>
      touch
        ? "Tap a spell, then tap your opponent. It costs AP — the blue number."
        : "Pick a spell — click it, or press its number key — then click your opponent. It costs AP, the blue number.",
    ready: myTurn,
    waiting: WAIT_FOR_TURN,
    done: (now, opened) => now.opponentHealth < opened.opponentHealth,
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
      "Bring the other one to zero health and you win. Terrain, ultimates and the turn clock you will pick up as you go.",
  },
];

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
