/** How many spells stay out when the spell arc is folded. */
export const FOLDED_COUNT = 3;

/**
 * Up to this many spells sit on a single ring and are always all out: a
 * five-spell bar has nothing worth folding away.
 */
export const SINGLE_RING_MAX = 5;
/** The single ring's radius: wide enough that five 46px spells never touch. */
export const SINGLE_RING_RADIUS = 128;

/** Whether a bar is long enough that the arc folds part of it away. */
export const needsFolding = (count: number): boolean => count > SINGLE_RING_MAX;

export type ArcSlot = { angle: number; radius: number; shown: boolean };

/**
 * Where each spell of the phone's spell arc sits around the main button.
 * Angles are in degrees, 180 due left of the centre and 270 straight up.
 * Unfolded, three spells ring the button and the rest a wider arc beyond;
 * folded, only the first three stay out and the others tuck in behind it.
 */
export const ringLayout = (count: number, folded: boolean): ArcSlot[] => {
  if (!needsFolding(count)) {
    // One ring, spread evenly from due left to straight up.
    const span = 90;
    return Array.from({ length: count }, (_, i) => ({
      angle: 180 + (count > 1 ? (span * i) / (count - 1) : span / 2),
      radius: SINGLE_RING_RADIUS,
      shown: true,
    }));
  }
  if (folded) {
    return Array.from({ length: count }, (_, i) =>
      i < FOLDED_COUNT
        ? { angle: [200, 232, 264][i], radius: 86, shown: true }
        : { angle: 225, radius: 20, shown: false }
    );
  }
  const inner = [200, 232, 264];
  const outer = [184, 205, 226, 247, 268];
  return Array.from({ length: count }, (_, i) =>
    i < inner.length
      ? { angle: inner[i], radius: 104, shown: true }
      : { angle: outer[i - inner.length] ?? 268, radius: 166, shown: true }
  );
};

/** A slot's offset from the arc's centre, in screen terms (y grows down). */
export const slotOffset = ({ angle, radius }: ArcSlot) => {
  const rad = (angle * Math.PI) / 180;
  return { dx: Math.cos(rad) * radius, dy: Math.sin(rad) * radius };
};
