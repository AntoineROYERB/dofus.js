/**
 * Whether the frame meter is shown. `?fps` in any address switches it on
 * and remembers it, since the game page drops the query once it has read
 * its own, and a phone has no console to set it from; `?fps=off` switches
 * it off again.
 */
export const meterEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const asked = new URLSearchParams(window.location.search).get("fps");
  try {
    if (asked === "off") window.localStorage.removeItem("asciiFps");
    else if (asked !== null) window.localStorage.setItem("asciiFps", "1");
    return window.localStorage.getItem("asciiFps") === "1";
  } catch {
    return asked !== null && asked !== "off";
  }
};
