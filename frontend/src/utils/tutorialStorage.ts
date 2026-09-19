import { TutorialStepId } from "./tutorialSteps";

const PROGRESS_KEY = "dofusjs.tutorial";
/** What the version that only ever remembered a yes or a no wrote. */
const LEGACY_SEEN_KEY = "dofusjs.tutorialSeen";
const PENDING_KEY = "dofusjs.tutorialPending";

/**
 * What this device remembers of the tour: whether it has run, and how far it
 * got. The step is kept so a player who walks out halfway — a phone call, a
 * closed tab — comes back to the step they were on rather than to the top.
 */
export interface TutorialProgress {
  seen: boolean;
  lastStep: TutorialStepId | null;
}

/** What a device that has never run the tour looks like — and what a device
 * whose site data is blocked, cleared or unreadable degrades to. Starting
 * from the beginning is always a correct answer; crashing is never one. */
const NOTHING: TutorialProgress = { seen: false, lastStep: null };

export const readTutorialProgress = (): TutorialProgress => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw === null) {
      return localStorage.getItem(LEGACY_SEEN_KEY) === "1"
        ? { seen: true, lastStep: null }
        : NOTHING;
    }
    const held: unknown = JSON.parse(raw);
    if (!held || typeof held !== "object") return NOTHING;
    const { seen, lastStep } = held as Partial<TutorialProgress>;
    return {
      seen: seen === true,
      // Anything that is not a string is not a step id. Which ids exist is
      // the tour's business, not this file's: it answers that by looking.
      lastStep: typeof lastStep === "string" ? (lastStep as TutorialStepId) : null,
    };
  } catch {
    return NOTHING;
  }
};

const write = (next: TutorialProgress): void => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or blocked site data: the tour just replays next time.
  }
};

/** Whether the guided tour has already run once on this device. */
export const hasSeenTutorial = (): boolean => readTutorialProgress().seen;

export const markTutorialSeen = (): void => {
  write({ seen: true, lastStep: null });
};

/** How far the tour has got, written down every time it moves on. */
export const rememberTutorialStep = (step: TutorialStepId): void => {
  write({ ...readTutorialProgress(), lastStep: step });
};

/**
 * Back to the top. A tour asked for by name starts at the first card: the
 * player pressing "Replay tutorial" is asking for the whole thing again, not
 * for the last step of the one they abandoned.
 */
export const forgetTutorialStep = (): void => {
  write({ ...readTutorialProgress(), lastStep: null });
};

/**
 * "Play the tutorial" is pressed on one screen and answered on another: the
 * lobby opens the match, and the game screen runs the tour in it. The request
 * rides in session storage rather than in router state because the way into a
 * match is the server telling us we are in a room, which no navigation carries.
 */
export const armTutorialMatch = (): void => {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // Nothing saved means the tour still runs for a first-time player; only
    // a deliberate replay is lost, and that is one button away.
  }
};

export const isTutorialMatchArmed = (): boolean => {
  try {
    return sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
};

export const disarmTutorialMatch = (): void => {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Same as above: worst case the next solo match opens the tour again.
  }
};
