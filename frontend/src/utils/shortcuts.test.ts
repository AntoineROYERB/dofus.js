import { shortcutFor } from "./shortcuts";

describe("shortcutFor", () => {
  it("reads the number row by position, so AZERTY's & is still 1", () => {
    expect(shortcutFor({ code: "Digit1", key: "&" })).toEqual({ kind: "spell", slot: 1 });
    expect(shortcutFor({ code: "Digit9", key: "ç" })).toEqual({ kind: "spell", slot: 9 });
  });

  it("takes the keypad too, and ignores 0", () => {
    expect(shortcutFor({ code: "Numpad4", key: "4" })).toEqual({ kind: "spell", slot: 4 });
    expect(shortcutFor({ code: "Digit0", key: "0" })).toBeNull();
  });

  it("ends the turn on Space, P and Tab", () => {
    for (const code of ["Space", "KeyP", "Tab"]) {
      expect(shortcutFor({ code, key: "" })).toEqual({ kind: "main" });
    }
  });

  it("maps Escape, L and H, and ? wherever it sits", () => {
    expect(shortcutFor({ code: "Escape", key: "Escape" })).toEqual({ kind: "back" });
    expect(shortcutFor({ code: "KeyL", key: "l" })).toEqual({ kind: "menu" });
    expect(shortcutFor({ code: "KeyH", key: "h" })).toEqual({ kind: "help" });
    expect(shortcutFor({ code: "Comma", key: "?" })).toEqual({ kind: "help" });
  });

  it("leaves every other key alone", () => {
    expect(shortcutFor({ code: "KeyW", key: "z" })).toBeNull();
  });
});
