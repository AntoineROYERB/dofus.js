import React from "react";

/**
 * The board is driven by pointer hover and clicks on small isometric cells;
 * there is no touch handling yet. Saying so is better than letting a visitor
 * on a phone conclude the game is broken.
 */
export const DesktopOnlyNotice: React.FC = () => (
  <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-[#05060a] px-8 text-center text-white">
    <div className="flex flex-col gap-3 max-w-xs">
      <p className="text-2xl font-bold tracking-tight">Dofus.js</p>
      <p className="text-sm text-gray-300">
        The board needs a mouse: cells are targeted by hovering, and touch input
        is not handled yet.
      </p>
      <p className="text-sm text-gray-400">
        Open this page on a laptop or desktop to play.
      </p>
    </div>
  </div>
);

export default DesktopOnlyNotice;
