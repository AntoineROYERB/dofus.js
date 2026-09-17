import { useState, useEffect } from "react";

/**
 * The board is a diamond of cells rendered in isometric projection: with a
 * radius of r it is (r + 1) tiles wide and, since a tile is twice as wide as
 * it is tall, half that in height. The old estimate used 0.75 of the grid's
 * span for both axes, which left roughly a third of the width unused — barely
 * visible on a desktop, and the difference between a playable board and a
 * postage stamp on a phone.
 *
 * It also returns the container's own size, which is where the board's centre
 * comes from. That used to be read off the DOM during render, so a board
 * first rendered before layout stayed centred on its top-left corner, at the
 * default tile size, until something else happened to re-render it — which
 * on the iOS app could be never.
 */
export const useTileSize = (
  containerRef: React.RefObject<HTMLDivElement>,
  gridSize: number
) => {
  const [layout, setLayout] = useState({
    tile: { width: 40, height: 20 },
    size: { width: 0, height: 0 },
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) {
        // Not laid out yet: try again on the next frame rather than waiting
        // for an observer that may already have reported the zero size.
        frame = requestAnimationFrame(measure);
        return;
      }

      const span = Math.floor(gridSize / 2) + 1;
      // Sprites stand a good deal taller than their cell, so the board keeps a
      // margin at the top rather than running its far row under the timeline.
      const byWidth = width / span;
      const byHeight = (height * 2) / (span + 1.4);
      const tile = Math.max(12, Math.min(byWidth, byHeight));

      setLayout((prev) =>
        prev.tile.width === tile &&
        prev.size.width === width &&
        prev.size.height === height
          ? prev
          : { tile: { width: tile, height: tile / 2 }, size: { width, height } }
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // Rotation and the web view's own chrome settling do not always reach a
    // ResizeObserver in a WKWebView; the window's events do.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [gridSize, containerRef]);

  return layout;
};
