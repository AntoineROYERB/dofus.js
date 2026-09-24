import { useLayoutEffect, useState } from "react";
import { fitTile } from "../utils/boardFit";

/**
 * How long after the board first measures itself it keeps checking every
 * frame. Long enough for a web view to finish settling, short enough that the
 * loop is over before the first turn is played.
 */
const SETTLE_MS = 1000;

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
 *
 * `measured` says whether any of it has been looked at yet. Until it has, the
 * numbers here are a guess, and a board drawn from a guessed centre is the
 * one sitting in the top-left corner of the screen instead of the middle of
 * it — so callers hide the board rather than draw it in the wrong place.
 */
export const useTileSize = (
  containerRef: React.RefObject<HTMLDivElement>,
  gridSize: number,
  /**
   * How much larger than "the whole board fits" to draw the tiles. 1 — the
   * board fitted to its box — for every screen that shows a fight whole. More
   * than that only while a camera is holding a fighter in the middle of the
   * screen, where the board is *meant* to run off the edges: see camera.ts.
   */
  zoom = 1
) => {
  const [layout, setLayout] = useState({
    tile: { width: 40, height: 20 },
    size: { width: 0, height: 0 },
    measured: false,
  });

  // Before the first paint: a board that measures itself in a passive effect
  // is drawn once from the guess above before anyone corrects it.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    /** Set by the first real measurement; the settle loop runs until then. */
    let settleUntil = 0;

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

      const tile = fitTile(width, height, gridSize) * zoom;

      setLayout((prev) =>
        prev.measured &&
        prev.tile.width === tile &&
        prev.size.width === width &&
        prev.size.height === height
          ? prev
          : {
              tile: { width: tile, height: tile / 2 },
              size: { width, height },
              measured: true,
            }
      );

      /*
       * A web view settling — the status bar appearing, the safe-area insets
       * arriving, the splash screen going away — resizes the board without a
       * ResizeObserver or a window event necessarily saying so, and the board
       * would then stay centred on a box it no longer has. For the first
       * moment after it appears, it checks for itself rather than trusting
       * anyone to tell it.
       */
      if (settleUntil === 0) settleUntil = performance.now() + SETTLE_MS;
      if (performance.now() < settleUntil) frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // Rotation and the web view's own chrome settling do not always reach a
    // ResizeObserver in a WKWebView; the window's events do.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("pageshow", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("pageshow", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [gridSize, containerRef, zoom]);

  return layout;
};
