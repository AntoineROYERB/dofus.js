// The same helpers as seen from inside the iOS app, with the plugins faked.
const impact = jest.fn(() => Promise.resolve());
const notification = jest.fn(() => Promise.resolve());
const selectionChanged = jest.fn(() => Promise.resolve());
const setStyle = jest.fn(() => Promise.reject(new Error("no status bar")));

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
jest.mock("@capacitor/haptics", () => ({
  Haptics: { impact, notification, selectionChanged },
  ImpactStyle: { Medium: "MEDIUM" },
  NotificationType: { Success: "SUCCESS", Error: "ERROR", Warning: "WARNING" },
}));
jest.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle },
  Style: { Light: "LIGHT", Dark: "DARK" },
}));

import {
  hapticGameOver,
  hapticHurry,
  hapticTap,
  hapticTurnStart,
  isNativeApp,
  setUpNativeShell,
} from "./native";

describe("native helpers inside the iOS app", () => {
  it("know they are running natively", () => {
    expect(isNativeApp).toBe(true);
  });

  it("buzz firmly when the turn comes round", () => {
    hapticTurnStart();
    expect(impact).toHaveBeenCalledWith({ style: "MEDIUM" });
  });

  it("tick as a spell is picked, and warn when time runs short", () => {
    hapticTap();
    expect(selectionChanged).toHaveBeenCalled();
    hapticHurry();
    expect(notification).toHaveBeenCalledWith({ type: "WARNING" });
    notification.mockClear();
  });

  it("buzz success or failure as the fight ends", () => {
    hapticGameOver(true);
    hapticGameOver(false);
    expect(notification).toHaveBeenNthCalledWith(1, { type: "SUCCESS" });
    expect(notification).toHaveBeenNthCalledWith(2, { type: "ERROR" });
  });

  it("swallow a plugin that fails instead of surfacing it mid-fight", async () => {
    expect(() => setUpNativeShell()).not.toThrow();
    // Light text: the frame is a night now, not paper.
    expect(setStyle).toHaveBeenCalledWith({ style: "DARK" });
    // Let the rejected promise settle: an unhandled one would fail the run.
    await new Promise((r) => setTimeout(r, 0));
  });
});
