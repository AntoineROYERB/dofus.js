import { readFileSync } from "fs";
import { resolve } from "path";
import { WorldContent } from "./islands";

/**
 * The islands exactly as the server ships them, for tests: the client has no
 * copy of its own, so its tests read the server's file rather than one that
 * could drift from it. Jest runs from frontend/.
 */
export const shippedWorld = (): WorldContent =>
  JSON.parse(readFileSync(resolve("../backend/config/islands.json"), "utf8"));
