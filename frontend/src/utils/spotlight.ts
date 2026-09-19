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
