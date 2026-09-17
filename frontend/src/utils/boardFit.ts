/**
 * The largest tile that fits the whole diamond in a box. With a radius of r
 * the board is (r + 1) tiles wide and, a tile being twice as wide as it is
 * tall, half that high — plus a margin at the top for sprites, which stand
 * taller than their cell.
 */
export const fitTile = (width: number, height: number, gridSize: number) => {
  const span = Math.floor(gridSize / 2) + 1;
  const byWidth = width / span;
  const byHeight = (height * 2) / (span + 1.4);
  return Math.max(12, Math.min(byWidth, byHeight));
};
