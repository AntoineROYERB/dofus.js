import {
  hapticGameOver,
  hapticHurry,
  hapticTap,
  hapticTurnStart,
  isNativeApp,
  setUpNativeShell,
} from "./native";

describe("native helpers outside the iOS app", () => {
  it("know they are not running natively", () => {
    expect(isNativeApp).toBe(false);
  });

  it("do nothing and never throw", () => {
    expect(() => {
      setUpNativeShell();
      hapticTurnStart();
      hapticGameOver(true);
      hapticGameOver(false);
    }).not.toThrow();
  });

  it("buzz through the vibration API where a browser has one", () => {
    const vibrate = jest.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    try {
      hapticTap();
      expect(vibrate).toHaveBeenCalledWith(8);
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it("stay still where the browser refuses to vibrate", () => {
    const vibrate = jest.fn(() => {
      throw new Error("not allowed");
    });
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    try {
      expect(() => {
        hapticTap();
        hapticHurry();
      }).not.toThrow();
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });
});
