/**
 * Darken a color by percentage
 */
export function darkenColor(color: string, percent: number): string {
  if (color.startsWith("rgba")) return color; // Don't modify rgba colors

  // Handle hex colors
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const darkenAmount = 1 - percent / 100;
  const newR = Math.floor(r * darkenAmount);
  const newG = Math.floor(g * darkenAmount);
  const newB = Math.floor(b * darkenAmount);

  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * Lighten a color by percentage
 */
export function lightenColor(color: string, percent: number): string {
  if (color.startsWith("rgba")) return color; // Don't modify rgba colors

  // Handle hex colors
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const lightenAmount = 1 + percent / 100;
  const newR = Math.min(255, Math.floor(r * lightenAmount));
  const newG = Math.min(255, Math.floor(g * lightenAmount));
  const newB = Math.min(255, Math.floor(b * lightenAmount));

  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}
