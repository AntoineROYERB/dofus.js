import React from "react";
import { outfitSheet } from "../../utils/fxManifest";

/** The outfit itself, facing you: its idle sheet's first frame, cropped to the figure. */
export const OutfitIcon: React.FC<{ sprite: string; size: number; framed?: boolean }> = ({
  sprite,
  size,
  framed = true,
}) => {
  // A frame twice the icon's size, so the figure — a third of its frame —
  // fills the icon; the sheet is 24 frames by 8 directions, south on row 3.
  const frame = size * 2.1;
  return (
    <span
      aria-hidden
      className={`block flex-none ${framed ? "border border-hairline bg-board" : ""}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${outfitSheet(sprite, "Idle")})`,
        backgroundSize: `${frame * 24}px ${frame * 8}px`,
        backgroundPosition: `${-(frame / 2 - size / 2)}px ${-(3 * frame + frame * 0.49 - size / 2)}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    />
  );
};

export default OutfitIcon;
