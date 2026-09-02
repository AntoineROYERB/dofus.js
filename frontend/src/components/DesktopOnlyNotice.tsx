import React from "react";

/**
 * The board is driven by pointer hover and clicks on small isometric cells;
 * there is no touch handling yet. Saying so is better than letting a visitor
 * on a phone conclude the game is broken.
 */
export const DesktopOnlyNotice: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper px-8 text-center text-ink md:hidden">
    <div className="flex max-w-xs flex-col gap-3">
      <p className="font-display text-[29px] font-bold tracking-tight">
        Dofus.js
      </p>
      <p className="text-sm text-graphite">
        The board needs a mouse: cells are targeted by hovering, and touch input
        is not handled yet.
      </p>
      <p className="text-sm text-muted">
        Open this page on a laptop or desktop to play.
      </p>
    </div>
  </div>
);

export default DesktopOnlyNotice;
