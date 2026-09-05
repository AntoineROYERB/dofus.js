const KEY = "dofusjs.tutorialSeen";

/** Whether the guided tour has already run once on this device. */
export const hasSeenTutorial = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const markTutorialSeen = (): void => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private browsing or blocked site data: the tour just replays next time.
  }
};
