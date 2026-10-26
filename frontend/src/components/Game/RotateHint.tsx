import React, { useEffect, useState } from "react";
import { isNativeApp } from "../../lib/native";
import { t } from "../../i18n/lang";

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

  // The iOS app is locked to landscape; there is nothing to turn.
  if (isNativeApp || !portrait || dismissed) return null;

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
        {t("Turn your phone sideways — the board is twice as wide as it is tall.")}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="-my-2 flex-none px-2 py-3 font-mono text-[9.5px] uppercase tracking-label text-ink"
      >
        {t("Got it")}
      </button>
    </div>
  );
};

export default RotateHint;
