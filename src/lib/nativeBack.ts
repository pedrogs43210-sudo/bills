/**
 * Android's hardware back button, and closing the app when there is nowhere left to go back to.
 *
 * Isolated here because it is the one piece of the app that only exists inside a native shell.
 * On the web both functions are no-ops, so nothing has to know which it is running in — and the
 * Capacitor plugin is imported lazily, so a browser never loads code it cannot use.
 */

/** True only inside the Capacitor shell. */
function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

/**
 * Calls `handler` when the hardware back button is pressed. Returns a cleanup function, so it
 * fits a `useEffect` on the web (where it does nothing) and on a device alike.
 */
export function onHardwareBack(handler: () => void): () => void {
  if (!isNative()) return () => {};

  let remove: (() => void) | null = null;
  let cancelled = false;

  void import("@capacitor/app")
    .then(({ App }) => App.addListener("backButton", handler))
    .then((listener) => {
      if (cancelled) {
        void listener.remove();
        return;
      }
      remove = () => void listener.remove();
    })
    .catch(() => {
      // A missing plugin must not take the app down; back simply behaves as it did before.
    });

  return () => {
    cancelled = true;
    remove?.();
  };
}

/** Closes the app. Android only — iOS has no back button and Apple forbids exiting on demand. */
export async function exitApp(): Promise<void> {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.exitApp();
  } catch {
    // Nothing sensible to do if the shell will not close; leaving the screen as it is beats
    // throwing from a button press.
  }
}
