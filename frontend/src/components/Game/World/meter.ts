/**
 * Whether the frame meter is shown: `?fps` in the address, or
 * `localStorage.asciiFps = "1"` for pages that drop the query (the game
 * page does, once it has read its own).
 */
export const meterEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("fps")) return true;
  try {
    return window.localStorage.getItem("asciiFps") === "1";
  } catch {
    return false;
  }
};
