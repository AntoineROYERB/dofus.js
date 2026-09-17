// The iOS app serves its page from capacitor://localhost, where there is no
// game server. A bundle built without VITE_WS_URL opens on a lobby that never
// connects, so the build stops here instead.
if (!process.env.VITE_WS_URL?.trim()) {
  console.error(
    "VITE_WS_URL is not set. The iOS bundle needs the game server's address, e.g.\n" +
      "  VITE_WS_URL=wss://dofusjs.onrender.com npm run ios:sync"
  );
  process.exit(1);
}
