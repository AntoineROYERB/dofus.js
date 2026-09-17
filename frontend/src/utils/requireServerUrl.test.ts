/// <reference types="node" />
import { spawnSync } from "child_process";
import { resolve } from "path";

// The guard `npm run ios:sync` runs before building the iOS bundle.
const script = resolve(__dirname, "../../scripts/require-server-url.mjs");

const run = (env: Record<string, string | undefined>) =>
  spawnSync(process.execPath, [script], {
    env: { ...process.env, VITE_WS_URL: undefined, ...env },
    encoding: "utf8",
  });

describe("require-server-url", () => {
  it("stops an iOS build that has no game server address", () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("VITE_WS_URL is not set");
  });

  it("stops one whose address is blank", () => {
    expect(run({ VITE_WS_URL: "   " }).status).toBe(1);
  });

  it("lets one with an address through", () => {
    expect(run({ VITE_WS_URL: "wss://example.com" }).status).toBe(0);
  });
});
