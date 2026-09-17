import React from "react";

/**
 * The catalogue ships an emoji per spell, and emoji are the single thing that
 * dated the old bar the most: many different drawing styles, many different
 * weights, and a rendering that changes with the operating system. These are
 * the same spells drawn with one stroke, keyed by catalogue id.
 *
 * An unknown id falls back to the server's emoji, so adding a spell server-side
 * still renders something.
 */
const flame = "M12 3c.4 3.2 2.2 4.4 3.6 6.2A6.5 6.5 0 0 1 17 13a5 5 0 0 1-10 0c0-1.6.7-2.8 1.6-3.8.3 1 .9 1.6 1.6 1.9-.6-2.9-.1-6 1.8-8.1Z";
const smallFlame = (x: number) =>
  `M${x} 17c-1.8-1-2.2-2.6-1.4-4.2.4.8.9 1 1.3 1.1-.2-1.4.3-2.6 1.3-3.4.1 1.6 1.4 2.4 1.4 4.1A2.6 2.6 0 0 1 ${x} 17Z`;
const cloud = "M7 15.5a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 16.2 7 3.8 3.8 0 0 1 17 15.5Z";

const paths: Record<number, React.ReactNode> = {
  // Kindle
  1: (
    <>
      <path d={flame} />
      <path d="M12 21a3 3 0 0 0 3-3c0-1.4-1.4-2.2-3-4.2-1.6 2-3 2.8-3 4.2a3 3 0 0 0 3 3Z" />
    </>
  ),
  // Scorched Earth
  2: (
    <>
      <path d="M2.5 20.5h19" />
      <path d={smallFlame(6)} />
      <path d={smallFlame(12)} />
      <path d={smallFlame(18)} />
    </>
  ),
  // Combustion
  3: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" />
    </>
  ),
  // Smokescreen
  4: (
    <>
      <path d="M5 13a3 3 0 0 1 1-5.8A4.5 4.5 0 0 1 14.6 6 3.4 3.4 0 0 1 19 9.3 2.9 2.9 0 0 1 18.5 15H6" />
      <path d="M4 18.5h11M8 21.5h11" />
    </>
  ),
  // Meteor
  5: (
    <>
      <circle cx="15.5" cy="8.5" r="4.5" />
      <path d="M8.5 13.5 3 19M9.5 8 5 6.5M14 16.5l1.5 4.5" />
      <path d="M14 7.5a1.5 1.5 0 0 1 2 1" />
    </>
  ),
  // Updraft
  6: (
    <>
      <path d="M8 21c-3-1.2-3-4 0-5.2s3-4 0-5.2" />
      <path d="M16 21c3-1.2 3-4 0-5.2s-3-4 0-5.2" />
      <path d="M12 21V3M8.5 6.5 12 3l3.5 3.5" />
    </>
  ),
  // Lightning
  7: <path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6Z" />,
  // Gale
  8: (
    <>
      <path d="M12 12.2a2.6 2.6 0 1 1 2.6 2.6c-2.6 0-4.4-2.1-4.4-4.7A6.2 6.2 0 0 1 16.4 4c3.9 0 6.4 3.1 6.4 6.8" />
      <path d="M2 8h7M2 12h5M2 16h8" />
    </>
  ),
  // Tailwind
  9: (
    <>
      <path d="M11 6l6 6-6 6M5 6l6 6-6 6" />
      <path d="M17.5 8.5h4M18.5 12h3M17.5 15.5h4" />
    </>
  ),
  // Tempest
  10: (
    <>
      <path d={cloud} />
      <path d="M12.5 13 10 17.5h3.2L11.5 21.5" />
    </>
  ),
  // Geyser
  11: (
    <>
      <path d="M3 21h18" />
      <path d="M10 21V10M14 21V10" />
      <path d="M12 10c-3.5 0-5-2-5-4.5M12 10c3.5 0 5-2 5-4.5M12 10V3" />
    </>
  ),
  // Bubble Trap
  12: (
    <>
      <circle cx="9" cy="13" r="5" />
      <circle cx="17" cy="8" r="3" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M6.8 11a2.5 2.5 0 0 1 2.2-1.6" />
    </>
  ),
  // Downpour
  13: (
    <>
      <path d={cloud} />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </>
  ),
  // Frozen Ground
  14: (
    <>
      <path d="M12 2v20M3.4 7l17.2 10M20.6 7 3.4 17" />
      <path d="M12 6.2 9.8 4.4M12 6.2l2.2-1.8M12 17.8l-2.2 1.8M12 17.8l2.2 1.8" />
    </>
  ),
  // Maelstrom
  15: (
    <path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3 3 0 0 1 10.5 10.5 4.5 4.5 0 0 1 15 6a6 6 0 0 1 6 6 7.5 7.5 0 0 1-7.5 7.5A9 9 0 0 1 3 12" />
  ),
  // Earthleap
  16: (
    <>
      <path d="M2.5 20.5h19" />
      <path d="M4 17c2-9 13-9 16 0" />
      <path d="M16.5 15.5 20 17l1-3.6" />
    </>
  ),
  // Hammer
  17: (
    <>
      <path d="M5 4h9l2 2v4H5Z" />
      <path d="M10 10v11" />
      <path d="M16 6h3" />
    </>
  ),
  // Stone Grapple
  18: (
    <>
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <path d="M9 12h3" />
      <ellipse cx="14.5" cy="12" rx="2.5" ry="1.8" />
      <path d="M17 12h2.5M21.5 9.5 19.5 12l2 2.5" />
    </>
  ),
  // Pillar
  19: (
    <>
      <path d="M12 3 19 6.5v11L12 21 5 17.5v-11Z" />
      <path d="M5 6.5 12 10l7-3.5M12 10v11" />
    </>
  ),
  // Earthquake
  20: (
    <>
      <path d="M2.5 14h19" />
      <path d="M12 14 10 17l3 2-2 2.5M6 14l-1 2.5M18 14l1.5 3" />
      <path d="M4 9l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3" />
    </>
  ),
};

interface SpellGlyphProps {
  spellId: number;
  /** Shown for a spell that has no drawn glyph yet. */
  fallback: string;
  className?: string;
}

export const SpellGlyph: React.FC<SpellGlyphProps> = ({
  spellId,
  fallback,
  className = "w-7 h-7",
}) => {
  const glyph = paths[spellId];
  if (!glyph) return <span className={className}>{fallback}</span>;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {glyph}
    </svg>
  );
};

export default SpellGlyph;
