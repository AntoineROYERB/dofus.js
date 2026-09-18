import { GAME_STATUS } from "../types/game";
import {
  TUTORIAL_STEPS,
  TutorialFacts,
  TutorialStepId,
  isStepDone,
  isStepReady,
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
