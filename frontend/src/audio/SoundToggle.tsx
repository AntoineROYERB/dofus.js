import React from "react";
import { useSoundSettings } from "./useSound";
import { playTap } from "./sfx";
import { t } from "../i18n/lang";

/**
 * Sound on or off, in the frame's own type: a word, not an icon, like every
 * other control around it. It mutes both music and effects at once; the
 * levels behind it are kept, so switching back on returns them as they were.
 */
export const SoundToggle: React.FC<{ className?: string }> = ({
  className = "font-mono text-[9.5px] uppercase tracking-label text-muted transition-colors hover:text-vermilion",
}) => {
  const [settings, change] = useSoundSettings();
  return (
    <button
      type="button"
      aria-pressed={!settings.muted}
      onClick={() => {
        change({ muted: !settings.muted });
        // Turning sound on answers itself with a tap: proof it is on now.
        if (settings.muted) playTap();
      }}
      className={className}
    >
      {settings.muted ? t("Sound: off") : t("Sound: on")}
    </button>
  );
};
