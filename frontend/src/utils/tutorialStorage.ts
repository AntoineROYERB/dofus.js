const SEEN_KEY = "dofusjs.tutorialSeen";
const PENDING_KEY = "dofusjs.tutorialPending";

/** Whether the guided tour has already run once on this device. */
export const hasSeenTutorial = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

export const markTutorialSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private browsing or blocked site data: the tour just replays next time.
  }
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
