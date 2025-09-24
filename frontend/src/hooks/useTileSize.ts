import { useState, useEffect } from "react";

export const useTileSize = (
  containerRef: React.RefObject<HTMLDivElement>,
  gridSize: number
) => {
  const [tileSize, setTileSize] = useState({ width: 40, height: 20 });

  useEffect(() => {
    const calculateTileSize = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // For a diamond grid, we need to account for both axes
      const radius = Math.floor(gridSize / 2);

      // Calculate maximum width based on diamond shape
      // The max width of the diamond is 2*radius+1 tiles
      const maxWidth = 2 * radius + 1;

      // Calculate tile width to fit the container width
      // We need to account for the fact that tiles are staggered
      const tileWidth = containerWidth / (maxWidth * 0.75);

      // Make sure tiles aren't too tall for container height
      const maxHeight = 2 * radius + 1;
      const maxTileHeight = containerHeight / (maxHeight * 0.75);
      const maxTileWidth = maxTileHeight * 2;

      // Use the smaller of the two calculations to ensure grid fits
      const finalWidth = Math.min(tileWidth, maxTileWidth);
      const finalHeight = finalWidth * 0.5;

      setTileSize({ width: finalWidth, height: finalHeight });
    };

    calculateTileSize();
    window.addEventListener("resize", calculateTileSize);
    return () => window.removeEventListener("resize", calculateTileSize);
  }, [gridSize, containerRef]);

  return tileSize;
};
