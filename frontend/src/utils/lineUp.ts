/** Remainder that is never negative, for turning past either end of a list. */
export const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * The home screen's class line-up keeps an unbounded position, so turning
 * past the last class keeps sliding the same way. When the selected class
 * changes from elsewhere, the line jumps to it within the same lap.
 */
export const shownPosition = (
  position: number,
  selectedIndex: number,
  count: number
) => {
  const current = mod(position, count);
  return current === selectedIndex ? position : position - current + selectedIndex;
};

/**
 * How a fighter looks at `offset` places from the one on the stand: the
 * neighbours smaller, paler and further back, anything beyond them hidden.
 */
export const lineUpSlot = (offset: number) => {
  const distance = Math.abs(offset);
  return {
    x: offset * 105,
    y: distance === 0 ? 0 : -14,
    scale: distance === 0 ? 1 : 0.6,
    opacity: distance === 0 ? 1 : distance === 1 ? 0.3 : 0,
  };
};
