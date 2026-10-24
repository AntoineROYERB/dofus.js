import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("starts from the defaults when nothing was stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("reads back what was stored", () => {
    expect(parseSettings(JSON.stringify({ muted: true, music: 0.2, effects: 1 }))).toEqual({
      muted: true,
      music: 0.2,
      effects: 1,
    });
  });

  it("refuses a value out of range, or not a number, field by field", () => {
    expect(parseSettings(JSON.stringify({ music: 4, effects: "loud", muted: "yes" }))).toEqual({
      muted: false,
      music: 1,
      effects: DEFAULT_SETTINGS.effects,
    });
  });

  it("survives a value that is not JSON", () => {
    expect(parseSettings("{oops")).toEqual(DEFAULT_SETTINGS);
  });
});
