import React, { useEffect, useState } from "react";

const KEY = "dofusjs.rotateHintSeen";

/**
 * The board is wide and shallow; a phone held upright gives it a strip. This
 * says so once and gets out of the way — it never blocks play, because a
 * player who wants to fight in portrait is welcome to.
 */
export const RotateHint: React.FC = () => {
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 820px) and (orientation: portrait)"
    );
    const update = () => setPortrait(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!portrait || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private browsing: it will offer once more next time.
    }
  };

  return (
    <div className="flex flex-none items-center gap-3 border-b border-hairline bg-panel px-3 py-2">
      <span className="flex-1 text-[12px] leading-snug text-graphite">
        Turn your phone sideways — the board is twice as wide as it is tall.
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="flex-none font-mono text-[9.5px] uppercase tracking-label text-muted"
      >
        Got it
      </button>
    </div>
  );
};

export default RotateHint;
