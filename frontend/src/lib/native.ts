import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * The few places the iOS app does something a browser tab cannot. Every
 * function is a no-op on the web, so callers never have to ask where they run,
 * and a plugin that fails (an old OS, a simulator without a Taptic Engine)
 * is ignored rather than surfacing as an error in the middle of a fight.
 */
export const isNativeApp = Capacitor.isNativePlatform();

const quietly = (run: () => Promise<unknown>) => {
  if (!isNativeApp) return;
  run().catch(() => {});
};

/** Light status-bar text over the night background, once at start-up. */
export const setUpNativeShell = () =>
  quietly(() => StatusBar.setStyle({ style: Style.Dark }));

/** A firm tap when the turn comes round, for a player who looked away. */
export const hapticTurnStart = () =>
  quietly(() => Haptics.impact({ style: ImpactStyle.Medium }));

/** Success or failure buzz as the result modal opens. */
export const hapticGameOver = (won: boolean) =>
  quietly(() =>
    Haptics.notification({
      type: won ? NotificationType.Success : NotificationType.Error,
    })
  );

/**
 * The lightest tick, as a spell is picked or put down: the finger feels the
 * deck answer before the eye has found the board. An Android browser gets
 * the same from the vibration API; elsewhere on the web it does nothing.
 */
export const hapticTap = () => {
  if (isNativeApp) {
    quietly(() => Haptics.selectionChanged());
    return;
  }
  try {
    navigator.vibrate?.(8);
  } catch {
    // A browser that refuses is a browser that stays still.
  }
};

/** A warning buzz when ten seconds of the turn are left. */
export const hapticHurry = () =>
  quietly(() => Haptics.notification({ type: NotificationType.Warning }));
