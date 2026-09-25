import React from "react";
import { ContentResponse, Loadout } from "../../types/message";
import { kitOf } from "../../utils/loadoutUtils";

interface KitTagProps {
  loadout: Partial<Loadout> | undefined;
  content: ContentResponse | null | undefined;
  className?: string;
}

/**
 * What a fighter plays — its grimoire — in the same small mono type as every
 * other label. The outfit's colour, which tells its element, is a 6px square
 * and nothing more, the way a spell's element is on the bar: saturated colour
 * on this screen is kept for what a click is about to do.
 */
export const KitTag: React.FC<KitTagProps> = ({
  loadout,
  content,
  className = "",
}) => {
  const kit = kitOf(loadout, content);
  if (!kit) return null;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 font-mono text-[9.5px] uppercase tracking-label text-muted ${className}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none -translate-y-px"
        style={{ backgroundColor: kit.outfit.palette.primary }}
      />
      {kit.grimoire.name}
    </span>
  );
};
