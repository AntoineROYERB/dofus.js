import {
  hapticGameOver,
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
});
