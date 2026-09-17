import { useState, useEffect } from "react";
import { fitTile } from "../utils/boardFit";

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

      const tile = fitTile(width, height, gridSize);

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
