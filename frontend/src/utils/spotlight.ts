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

/** What a card has to work around. */
export interface KeepClear {
  /**
   * The cells the player could click. There are usually dozens, and on a
   * crowded turn no spot covers none of them, so these are counted rather
   * than obeyed: the card takes the position that hides the fewest.
   */
  cells: Box[];
  /**
   * What the card may not cover at all: the elements this step is lighting.
   * Sitting on the spell bar while saying "pick a spell" is worse than
   * sitting on a corner of a range, however many cells that corner holds.
   */
  never: Box[];
}

/**
 * Where to put the card so it hides as little as possible of what the player
 * is meant to be looking at. The preferred spot — beside whatever the step is
 * pointing at — is kept whenever it is as good as anything else; otherwise the
 * corners and the middles of the edges are tried.
 *
 * Anything covering most of the screen is dropped from `never` first: the
 * board is always under the card, and a rule no position can satisfy decides
 * nothing while making every position look equally bad.
 */
export const placeCard = (
  preferred: Spot,
  card: { width: number; height: number },
  screen: { width: number; height: number },
  keepClear: KeepClear,
  margin = 16
): Spot => {
  const boxAt = (spot: Spot): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + card.width,
    bottom: spot.top + card.height,
  });
  const area = (box: Box) => (box.right - box.left) * (box.bottom - box.top);
  const screenArea = screen.width * screen.height;
  const never = keepClear.never.filter((box) => area(box) < screenArea * 0.5);
  const clears = (spot: Spot) =>
    !never.some((box) => overlaps(boxAt(spot), box));
  const hidden = (spot: Spot) =>
    keepClear.cells.filter((cell) => overlaps(boxAt(spot), cell)).length;

  if (clears(preferred) && hidden(preferred) === 0) return preferred;

  const left = margin;
  const right = Math.max(margin, screen.width - card.width - margin);
  const middle = Math.max(margin, (screen.width - card.width) / 2);
  const top = margin;
  const bottom = Math.max(margin, screen.height - card.height - margin);
  const spots: Spot[] = [
    preferred,
    { top: bottom, left: middle },
    { top, left: middle },
    { top: bottom, left },
    { top: bottom, left: right },
    { top, left },
    { top, left: right },
  ];

  // Positions that cover nothing they must not, if there are any at all.
  const allowed = spots.filter(clears);
  const ranked = allowed.length > 0 ? allowed : spots;

  let best = ranked[0];
  let fewest = hidden(best);
  for (const spot of ranked.slice(1)) {
    const covered = hidden(spot);
    if (covered < fewest) {
      best = spot;
      fewest = covered;
      if (fewest === 0) break;
    }
  }
  return best;
};
