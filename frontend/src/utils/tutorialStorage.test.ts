import {
  armTutorialMatch,
  disarmTutorialMatch,
  forgetTutorialStep,
  hasSeenTutorial,
  isTutorialMatchArmed,
  markTutorialSeen,
  readTutorialProgress,
  rememberTutorialStep,
} from "./tutorialStorage";

type Store = { [key: string]: string };

/** A localStorage that works, and can be made to stop working. */
const fakeStorage = () => {
  let held: Store = {};
  let blocked = false;
  const guard = () => {
    if (blocked) throw new DOMException("site data is blocked");
  };
  return {
    block: () => void (blocked = true),
    clear: () => {
      held = {};
      blocked = false;
    },
    set raw(value: Store) {
      held = value;
    },
    api: {
      getItem: (k: string) => (guard(), held[k] ?? null),
      setItem: (k: string, v: string) => void (guard(), (held[k] = v)),
      removeItem: (k: string) => void (guard(), delete held[k]),
    },
  };
};

const local = fakeStorage();
const session = fakeStorage();

beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = local.api;
  (globalThis as { sessionStorage?: unknown }).sessionStorage = session.api;
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});
beforeEach(() => {
  local.clear();
  session.clear();
});

describe("what the tour remembers", () => {
  it("remembers nothing on a device that has never run it", () => {
    expect(readTutorialProgress()).toEqual({ seen: false, lastStep: null });
    expect(hasSeenTutorial()).toBe(false);
  });

  it("comes back to the step it was left on", () => {
    rememberTutorialStep("walk");
    rememberTutorialStep("cast");
    expect(readTutorialProgress().lastStep).toBe("cast");
  });

  it("keeps the step and the seen flag apart", () => {
    rememberTutorialStep("peek");
    markTutorialSeen();
    // Finished: seen, and no half-played step for the next tour to resume.
    expect(readTutorialProgress()).toEqual({ seen: true, lastStep: null });
  });

  it("starts a replay at the top without forgetting it has been seen", () => {
    markTutorialSeen();
    rememberTutorialStep("endTurn");
    forgetTutorialStep();
    expect(readTutorialProgress()).toEqual({ seen: true, lastStep: null });
  });

  it("still reads the plain flag the previous version wrote", () => {
    local.raw = { "dofusjs.tutorialSeen": "1" };
    expect(readTutorialProgress()).toEqual({ seen: true, lastStep: null });
  });
});

describe("site data that is cleared, blocked or nonsense", () => {
  it("starts from the beginning when the stored value is not JSON", () => {
    local.raw = { "dofusjs.tutorial": "{ half a" };
    expect(readTutorialProgress()).toEqual({ seen: false, lastStep: null });
  });

  it("starts from the beginning when the stored value is the wrong shape", () => {
    local.raw = { "dofusjs.tutorial": JSON.stringify({ seen: "yes", lastStep: 3 }) };
    expect(readTutorialProgress()).toEqual({ seen: false, lastStep: null });
  });

  it("degrades to 'never seen' rather than throwing when reads are blocked", () => {
    local.block();
    expect(readTutorialProgress()).toEqual({ seen: false, lastStep: null });
    expect(hasSeenTutorial()).toBe(false);
  });

  it("swallows a write that is refused", () => {
    local.block();
    expect(() => markTutorialSeen()).not.toThrow();
    expect(() => rememberTutorialStep("walk")).not.toThrow();
    expect(() => forgetTutorialStep()).not.toThrow();
  });
});

describe("the request for a tutorial match", () => {
  it("rides from one screen to the other and is spent once", () => {
    expect(isTutorialMatchArmed()).toBe(false);
    armTutorialMatch();
    expect(isTutorialMatchArmed()).toBe(true);
    disarmTutorialMatch();
    expect(isTutorialMatchArmed()).toBe(false);
  });

  it("reads as unarmed, and never throws, when session data is blocked", () => {
    session.block();
    expect(() => armTutorialMatch()).not.toThrow();
    expect(isTutorialMatchArmed()).toBe(false);
    expect(() => disarmTutorialMatch()).not.toThrow();
  });
});
