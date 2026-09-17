import type { CapacitorConfig } from "@capacitor/cli";

/*
 * The iOS app is this same client, built by Vite and shipped inside a native
 * shell. Nothing here is loaded from the network in a normal build: the page
 * is served from the app bundle as capacitor://localhost, and only the game
 * server is remote — which is why a device build needs VITE_WS_URL.
 *
 * CAP_SERVER_URL switches that off for development: the shell loads the Vite
 * dev server instead, so an edit shows up on the phone without a rebuild.
 *   CAP_SERVER_URL=http://192.168.1.20:5173 npx cap run ios
 */
const devServer = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  // Must match the bundle identifier registered on the Apple Developer
  // account before the app can go to TestFlight or the App Store.
  appId: "com.antoineroyerb.dofusjs",
  appName: "Dofus.js",
  webDir: "dist",
  ios: {
    // The page pads itself with the safe-area insets (viewport-fit=cover),
    // so the web view runs edge to edge rather than being inset twice.
    contentInset: "never",
    backgroundColor: "#f2f2f0",
  },
  server: devServer ? { url: devServer, cleartext: true } : undefined,
};

export default config;
