import { GAME_STATUS } from "../types/game";
import {
  TUTORIAL_STEPS,
  TutorialFacts,
  TutorialStepId,
  isStepDone,
  isStepReady,
  isStepStalled,
  resumeIndex,
  tourIsOver,
} from "./tutorialSteps";

const facts = (over: Partial<TutorialFacts> = {}): TutorialFacts => ({
  status: GAME_STATUS.PLAYING,
  hasPositioned: true,
  isMyTurn: true,
  movementPoints: 4,
  maxMovementPoints: 4,
  opponentHealth: 50,
  peeks: 0,
  canCast: true,
  opponentIsDummy: false,
  turnNumber: 1,
  ...over,
});

const step = (id: TutorialStepId) => {
  const found = TUTORIAL_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
};

describe("the tour's shape", () => {
  it("opens and closes on a card with nothing to do", () => {
    expect(TUTORIAL_STEPS[0].done).toBeUndefined();
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].done).toBeUndefined();
  });

  it("asks for five actions in between", () => {
    expect(TUTORIAL_STEPS.filter((s) => !!s.done)).toHaveLength(5);
  });

  it("points every objective at an element the game actually renders", () => {
    const ids = ["tutorial-board", "tutorial-spellbar", "tutorial-mainbutton"];
    for (const s of TUTORIAL_STEPS.filter((x) => !!x.done)) {
      expect(ids).toContain(s.targetId);
      if (s.alsoId) expect(ids).toContain(s.alsoId);
    }
  });

  it("lights the button a step tells the player to press", () => {
    // Placing asks for a cell and then for Fight; leaving the button in the
    // dark is how the old tour told a player to press something it had greyed.
    expect(step("place").alsoId).toBe("tutorial-mainbutton");
    // Casting asks for a spell and then for a target on the board.
    expect(step("cast").alsoId).toBe("tutorial-board");
  });

  it("never lights the same element twice", () => {
    for (const s of TUTORIAL_STEPS) {
      if (s.alsoId) expect(s.alsoId).not.toBe(s.targetId);
    }
  });

  it("never talks about hovering or number keys to a finger", () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.body(true).toLowerCase()).not.toMatch(/hover|number key|tab key/);
    }
  });

  it("never tells a mouse to tap or hold", () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.body(false).toLowerCase()).not.toMatch(/\btap\b|\bhold\b/);
    }
  });

  it("says what it is waiting for whenever it can be blocked", () => {
    for (const s of TUTORIAL_STEPS) {
      if (s.ready) expect(s.waiting).toBeTruthy();
    }
  });
});

describe("placing", () => {
  it("waits for the placement phase", () => {
    expect(
      isStepReady(step("place"), facts({ status: GAME_STATUS.CREATING_PLAYER }))
    ).toBe(false);
    expect(
      isStepReady(
        step("place"),
        facts({ status: GAME_STATUS.POSITION_CHARACTERS })
      )
    ).toBe(true);
  });

  it("is done once the placement is confirmed", () => {
    const opened = facts({ hasPositioned: false });
    expect(isStepDone(step("place"), opened, opened)).toBe(false);
    expect(
      isStepDone(step("place"), facts({ hasPositioned: true }), opened)
    ).toBe(true);
  });
});

describe("walking", () => {
  it("waits for our own turn", () => {
    expect(isStepReady(step("walk"), facts({ isMyTurn: false }))).toBe(false);
    expect(
      isStepReady(step("walk"), facts({ status: GAME_STATUS.GAME_OVER }))
    ).toBe(false);
  });

  it("is done when a point of movement is spent", () => {
    const opened = facts({ movementPoints: 4 });
    expect(isStepDone(step("walk"), facts({ movementPoints: 4 }), opened)).toBe(
      false
    );
    expect(isStepDone(step("walk"), facts({ movementPoints: 3 }), opened)).toBe(
      true
    );
  });

  it("is done by a walk taken before the step opened, on a fresh turn", () => {
    // The turn rolled over between the two, so the snapshot's count is no
    // lower than the current one — but standing below full is proof enough.
    const opened = facts({ movementPoints: 1 });
    expect(
      isStepDone(
        step("walk"),
        facts({ movementPoints: 2, maxMovementPoints: 4 }),
        opened
      )
    ).toBe(true);
  });

  it("is not done on a full pool", () => {
    const opened = facts({ movementPoints: 4 });
    expect(
      isStepDone(
        step("walk"),
        facts({ movementPoints: 4, maxMovementPoints: 4 }),
        opened
      )
    ).toBe(false);
  });
});

describe("reading a spell", () => {
  it("can be done at any point in the match", () => {
    expect(
      isStepReady(step("peek"), facts({ status: GAME_STATUS.CREATING_PLAYER }))
    ).toBe(true);
  });

  it("is done on the next description opened, not on an earlier one", () => {
    const opened = facts({ peeks: 2 });
    expect(isStepDone(step("peek"), facts({ peeks: 2 }), opened)).toBe(false);
    expect(isStepDone(step("peek"), facts({ peeks: 3 }), opened)).toBe(true);
  });
});

describe("casting", () => {
  it("is done when the opponent loses health", () => {
    const opened = facts({ opponentHealth: 50 });
    expect(isStepDone(step("cast"), facts({ opponentHealth: 50 }), opened)).toBe(
      false
    );
    expect(isStepDone(step("cast"), facts({ opponentHealth: 44 }), opened)).toBe(
      true
    );
  });
});

describe("ending the turn", () => {
  it("is done when the turn number moves on", () => {
    const opened = facts({ turnNumber: 1 });
    expect(
      isStepDone(step("endTurn"), facts({ turnNumber: 2 }), opened)
    ).toBe(true);
  });

  it("is done when the turn simply passes to the opponent", () => {
    const opened = facts({ isMyTurn: true, turnNumber: 1 });
    expect(
      isStepDone(step("endTurn"), facts({ isMyTurn: false, turnNumber: 1 }), opened)
    ).toBe(true);
  });

  it("is not done while the turn is still ours", () => {
    const opened = facts({ isMyTurn: true, turnNumber: 1 });
    expect(
      isStepDone(step("endTurn"), facts({ isMyTurn: true, turnNumber: 1 }), opened)
    ).toBe(false);
  });
});

describe("a finished fight", () => {
  it("stands the tour down, whatever step it was on", () => {
    expect(tourIsOver(facts({ status: GAME_STATUS.GAME_OVER }))).toBe(true);
    expect(tourIsOver(facts({ status: GAME_STATUS.PLAYING }))).toBe(false);
    expect(
      tourIsOver(facts({ status: GAME_STATUS.POSITION_CHARACTERS }))
    ).toBe(false);
  });
});

describe("a turn with nothing left in it", () => {
  it("says to end the turn when there is no spell to cast", () => {
    const flat = facts({ canCast: false });
    expect(isStepStalled(step("cast"), flat)).toBe(true);
    expect(step("cast").stalled?.targetId).toBe("tutorial-mainbutton");
    expect(step("cast").stalled?.body(false).toLowerCase()).toContain(
      "end your turn"
    );
  });

  it("says to end the turn when there is no movement left", () => {
    expect(isStepStalled(step("walk"), facts({ movementPoints: 0 }))).toBe(true);
    expect(isStepStalled(step("walk"), facts({ movementPoints: 1 }))).toBe(
      false
    );
  });

  it("keeps quiet while the objective is still possible", () => {
    expect(isStepStalled(step("cast"), facts({ canCast: true }))).toBe(false);
    expect(isStepStalled(step("walk"), facts({ movementPoints: 4 }))).toBe(
      false
    );
  });

  it("keeps quiet on the opponent's turn, which has its own line", () => {
    const theirs = facts({ isMyTurn: false, canCast: false, movementPoints: 0 });
    expect(isStepStalled(step("cast"), theirs)).toBe(false);
    expect(isStepStalled(step("walk"), theirs)).toBe(false);
  });

  it("never tells a finger about the Tab key", () => {
    for (const s of TUTORIAL_STEPS) {
      if (!s.stalled) continue;
      expect(s.stalled.body(true).toLowerCase()).not.toContain("tab key");
      expect(s.stalled.targetId).toBe("tutorial-mainbutton");
    }
  });
});

describe("the opponent that stood still", () => {
  const closing = step("done");

  it("is not sent away with the same goodbye as a real fight", () => {
    expect(closing.againstDummy).toBeDefined();
    expect(closing.againstDummy?.body(false)).not.toEqual(closing.body(false));
  });

  it("says what the button is about to do", () => {
    expect(closing.againstDummy?.cta.toLowerCase()).toContain("wake");
  });

  it("is the only step that has anything different to say", () => {
    const withOne = TUTORIAL_STEPS.filter((s) => s.againstDummy);
    expect(withOne.map((s) => s.id)).toEqual(["done"]);
  });
});

describe("picking the tour back up", () => {
  const indexOf = (id: TutorialStepId) =>
    TUTORIAL_STEPS.findIndex((s) => s.id === id);

  it("starts at the top when nothing was remembered", () => {
    expect(resumeIndex(null, true)).toBe(0);
  });

  it("starts at the top when the remembered step is no longer a step", () => {
    expect(resumeIndex("nowhere" as TutorialStepId, true)).toBe(0);
  });

  it("comes back to the step that was left open", () => {
    expect(resumeIndex("cast", true)).toBe(indexOf("cast"));
  });

  it("will not resume past a board that still has to be stood on", () => {
    expect(resumeIndex("cast", false)).toBe(indexOf("place"));
    expect(resumeIndex("walk", false)).toBe(indexOf("place"));
  });

  it("leaves the opening card alone: it asks for nothing to be placed", () => {
    expect(resumeIndex("welcome", false)).toBe(0);
  });
});
