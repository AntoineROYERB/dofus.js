import React from "react";

/**
 * The catalogue ships an emoji per spell, and emoji are the single thing that
 * dated the old bar the most: eight different drawing styles, eight different
 * weights, and a rendering that changes with the operating system. These are
 * the same eight spells drawn with one stroke, keyed by catalogue id.
 *
 * An unknown id falls back to the server's emoji, so adding a spell server-side
 * still renders something.
 */
const paths: Record<number, React.ReactNode> = {
  // Braise
  1: (
    <>
      <path d="M12 3c.4 3.2 2.2 4.4 3.6 6.2A6.5 6.5 0 0 1 17 13a5 5 0 0 1-10 0c0-1.6.7-2.8 1.6-3.8.3 1 .9 1.6 1.6 1.9-.6-2.9-.1-6 1.8-8.1Z" />
      <path d="M12 21a3 3 0 0 0 3-3c0-1.4-1.4-2.2-3-4.2-1.6 2-3 2.8-3 4.2a3 3 0 0 0 3 3Z" />
    </>
  ),
  // Boule de feu
  2: (
    <>
      <circle cx="15.5" cy="8.5" r="4.5" />
      <path d="M8.5 13.5 3 19M9.5 8 5 6.5M14 16.5l1.5 4.5" />
    </>
  ),
  // Venin
  3: (
    <>
      <path d="M12 3a7 7 0 0 1 7 7c0 2.6-1.4 3.6-1.4 5.2 0 .9-.7 1.3-1.6 1.3H8c-.9 0-1.6-.4-1.6-1.3C6.4 13.6 5 12.6 5 10a7 7 0 0 1 7-7Z" />
      <circle cx="9.4" cy="10.2" r="1.6" />
      <circle cx="14.6" cy="10.2" r="1.6" />
      <path d="M9.5 16.5v3.5M14.5 16.5v3.5M12 16.5v3" />
    </>
  ),
  // Bourrasque
  4: (
    <>
      <path d="M12 12.2a2.6 2.6 0 1 1 2.6 2.6c-2.6 0-4.4-2.1-4.4-4.7A6.2 6.2 0 0 1 16.4 4c3.9 0 6.4 3.1 6.4 6.8" />
      <path d="M2 8h7M2 12h5M2 16h8" />
    </>
  ),
  // Nova de givre
  5: (
    <>
      <path d="M12 2v20M3.4 7l17.2 10M20.6 7 3.4 17" />
      <path d="M12 6.2 9.8 4.4M12 6.2l2.2-1.8M12 17.8l-2.2 1.8M12 17.8l2.2 1.8M6.2 9.4 3.6 9.6M17.8 14.6l2.6-.2M6.2 14.6l-2.6.2M17.8 9.4l2.6.2" />
    </>
  ),
  // Drain
  6: (
    <>
      <path d="M12 3.5c4 4.8 6.5 7.6 6.5 10.6a6.5 6.5 0 0 1-13 0C5.5 11.1 8 8.3 12 3.5Z" />
      <path d="M9 14.2a3 3 0 0 0 3 3" />
    </>
  ),
  // Carapace
  7: (
    <>
      <path d="M12 2.8 19.5 5.6v6.2c0 5-3.6 8-7.5 9.4-3.9-1.4-7.5-4.4-7.5-9.4V5.6Z" />
      <path d="M12 8v6M9 11h6" />
    </>
  ),
  // Gwendo na Gwendo
  8: (
    <>
      <path d="M12 2.6 21.4 12 12 21.4 2.6 12Z" />
      <path d="M12 7.4 16.6 12 12 16.6 7.4 12Z" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
};

interface SpellGlyphProps {
  spellId: number;
  /** Shown when the catalogue grows past the eight drawn glyphs. */
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
