/** A rectangle on screen, as `getBoundingClientRect` gives it. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The box around a set of boxes. The tour spotlights an element by cutting a
 * hole the size of its box — but an element whose children are all absolutely
 * positioned has no box of its own, and the phone's spell arc is exactly that:
 * it measured 780 by 0 at the top of the screen, so the tour asked the player
 * to hold a spell and left every spell in the dark. What such a wrapper holds
 * is what has to be lit.
 */
export const boxAround = (boxes: Box[]): Box | null => {
  if (boxes.length === 0) return null;
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
};

/** Whether a box has a size worth cutting a hole for. */
export const hasArea = (box: Box): boolean =>
  box.right > box.left && box.bottom > box.top;

/** Whether two boxes share any pixel. */
export const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export interface Spot {
  top: number;
  left: number;
}

/**
 * Where to put the card so it does not cover what the step is asking for.
 * The preferred spot wins whenever it is clear; otherwise the corners and the
 * middles of the edges are tried in turn, and if a screen is so full that
 * every one of them is blocked the preferred spot is kept — a card slightly
 * in the way beats a card thrown off the screen.
 */
export const placeCard = (
  preferred: Spot,
  card: { width: number; height: number },
  screen: { width: number; height: number },
  keepClear: Box | null,
  margin = 16
): Spot => {
  const boxAt = (spot: Spot): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + card.width,
    bottom: spot.top + card.height,
  });
  if (!keepClear || !overlaps(boxAt(preferred), keepClear)) return preferred;

  const left = margin;
  const right = screen.width - card.width - margin;
  const middle = (screen.width - card.width) / 2;
  const top = margin;
  const bottom = screen.height - card.height - margin;
  const candidates: Spot[] = [
    { top: bottom, left: middle },
    { top, left: middle },
    { top: bottom, left },
    { top: bottom, left: right },
    { top, left },
    { top, left: right },
  ];
  return (
    candidates.find((spot) => !overlaps(boxAt(spot), keepClear)) ?? preferred
  );
};
