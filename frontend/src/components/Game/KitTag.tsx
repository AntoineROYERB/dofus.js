import React from "react";
import { ContentResponse, Loadout } from "../../types/message";
import { kitOf } from "../../utils/loadoutUtils";
import { ElementGlyph } from "./ElementGlyph";

interface KitTagProps {
  loadout: Partial<Loadout> | undefined;
  content: ContentResponse | null | undefined;
  className?: string;
}

/**
 * What a fighter plays — its element's icon, then its grimoire — in the same
 * small mono type as every other label.
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
      title={`${kit.element} · ${kit.grimoire.name}`}
      className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-label text-muted ${className}`}
    >
      <ElementGlyph element={kit.element} size={10} />
      {kit.grimoire.name}
    </span>
  );
};
