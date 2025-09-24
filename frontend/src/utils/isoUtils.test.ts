import {
  isoToScreen,
  screenToIso,
  generateIsometricCoordinates,
  sortCoordinates,
} from "./isoUtils";

describe("isoUtils", () => {
  describe("isoToScreen", () => {
    it("should convert isometric coordinates to screen position", () => {
      const tileSize = { width: 40, height: 20 };
      const centerX = 200;
      const centerY = 100;

      // Test position (0, 0)
      const screenPos1 = isoToScreen(0, 0, tileSize, centerX, centerY);
      expect(screenPos1.x).toEqual(200); // Center x position
      expect(screenPos1.y).toEqual(100); // Center y position

      // Test position (1, 0)
      const screenPos2 = isoToScreen(1, 0, tileSize, centerX, centerY);
      expect(screenPos2.x).toEqual(220); // 200 + (1*40/2)
      expect(screenPos2.y).toEqual(110); // 100 + (1*20/2)

      // Test position (0, 1)
      const screenPos3 = isoToScreen(0, 1, tileSize, centerX, centerY);
      expect(screenPos3.x).toEqual(180); // 200 - (1*40/2)
      expect(screenPos3.y).toEqual(110); // 100 + (1*20/2)
    });
  });

  describe("screenToIso", () => {
    it("should convert screen coordinates to isometric position", () => {
      const tileSize = { width: 40, height: 20 };
      const centerX = 200;
      const centerY = 100;

      // Test center position
      const isoPos1 = screenToIso(200, 100, tileSize, centerX, centerY);
      expect(isoPos1.x).toEqual(0);
      expect(isoPos1.y).toEqual(0);

      // Test position after moving right and down (which corresponds to iso (1, 0))
      const isoPos2 = screenToIso(220, 110, tileSize, centerX, centerY);
      expect(isoPos2.x).toEqual(1);
      expect(isoPos2.y).toEqual(0);

      // Test position after moving left and down (which corresponds to iso (0, 1))
      const isoPos3 = screenToIso(180, 110, tileSize, centerX, centerY);
      expect(isoPos3.x).toEqual(0);
      expect(isoPos3.y).toEqual(1);
    });
  });

  describe("generateIsometricCoordinates", () => {
    it("should generate diamond-shaped coordinates for odd grid size", () => {
      const coords = generateIsometricCoordinates(5);

      // For grid size 5, we expect a diamond with radius 2
      // Total cells = 1 + 4 + 6 + 4 + 1 = 16
      expect(coords.length).toBe(13); // Count of positions in a diamond of radius 2

      // Check if center is included
      expect(coords).toContainEqual({ x: 0, y: 0 });

      // Check extreme points are included
      expect(coords).toContainEqual({ x: 0, y: -2 });
      expect(coords).toContainEqual({ x: 0, y: 2 });
      expect(coords).toContainEqual({ x: -2, y: 0 });
      expect(coords).toContainEqual({ x: 2, y: 0 });

      // Check some corners are excluded (outside diamond)
      expect(coords).not.toContainEqual({ x: -2, y: -2 });
      expect(coords).not.toContainEqual({ x: 2, y: 2 });
    });
  });

  describe("sortCoordinates", () => {
    it("should sort coordinates for proper back-to-front rendering", () => {
      const coords = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
      ];

      const sorted = sortCoordinates(coords);

      // Expect sorting by sum of coordinates (bottom-right to top-left)
      // Lower sum should come first (upper-left)
      expect(sorted[0]).toEqual({ x: -1, y: 0 }); // Sum: -1
      expect(sorted[1]).toEqual({ x: 0, y: -1 }); // Sum: -1
      expect(sorted[2]).toEqual({ x: 0, y: 0 }); // Sum: 0
      expect(sorted[3]).toEqual({ x: 0, y: 1 }); // Sum: 1
      expect(sorted[4]).toEqual({ x: 1, y: 0 }); // Sum: 1
    });
  });
});
