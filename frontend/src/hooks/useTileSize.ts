import { useState, useEffect } from "react";

/**
 * The board is a diamond of cells rendered in isometric projection: with a
 * radius of r it is (r + 1) tiles wide and, since a tile is twice as wide as
 * it is tall, half that in height. The old estimate used 0.75 of the grid's
 * span for both axes, which left roughly a third of the width unused — barely
 * visible on a desktop, and the difference between a playable board and a
 * postage stamp on a phone.
 */
export const useTileSize = (
  containerRef: React.RefObject<HTMLDivElement>,
  gridSize: number
) => {
  const [tileSize, setTileSize] = useState({ width: 40, height: 20 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      const span = Math.floor(gridSize / 2) + 1;
      // Sprites stand a good deal taller than their cell, so the board keeps a
      // margin at the top rather than running its far row under the timeline.
      const byWidth = width / span;
      const byHeight = (height * 2) / (span + 1.4);

      const tile = Math.max(12, Math.min(byWidth, byHeight));
      setTileSize({ width: tile, height: tile / 2 });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [gridSize, containerRef]);

  return tileSize;
};
