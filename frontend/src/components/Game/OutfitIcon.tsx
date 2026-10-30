import React from "react";
import { outfitSheet } from "../../utils/fxManifest";
import { soulOf, VESPER_ART } from "../../vfx/vesper";
import VesperFigure from "./VesperFigure";

/** The outfit itself, facing you: its idle sheet's first frame, cropped to the figure. */
export const OutfitIcon: React.FC<{ sprite: string; size: number; framed?: boolean }> = ({
  sprite,
  size,
  framed = true,
}) => {
  const soul = soulOf(sprite);
  if (soul) {
    // Ser Vesper has no sheet to crop: one still frame of him, framed the
    // same way, his body about two thirds of the icon.
    const scale = size / 4 / 30;
    return (
      <span
        aria-hidden
        className={`relative block flex-none overflow-hidden ${framed ? "border border-hairline bg-board" : ""}`}
        style={{ width: size, height: size }}
      >
        <VesperFigure
          soul={soul}
          gesture="idle"
          direction="S"
          scale={scale}
          still
          style={{
            position: "absolute",
            left: size / 2 - VESPER_ART.feetX * 4 * scale,
            top: size * 0.9 - VESPER_ART.feetY * 4 * scale,
          }}
        />
      </span>
    );
  }
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
