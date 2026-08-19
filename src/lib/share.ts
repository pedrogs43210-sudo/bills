export type ShareOutcome = "shared" | "copied" | "failed";

/** True only inside the Capacitor shell. Same probe as lib/nativeBack.ts. */
function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

/**
 * Hand `text` to whatever the platform uses to share, falling back to the clipboard.
 *
 * Three routes, in order of how much the person gets:
 *
 *   1. The native share sheet, on a device. This has to go through Capacitor's plugin rather than
 *      navigator.share, because an Android WebView is not Chrome: it implements no Web Share API
 *      at all, so navigator.share is simply undefined inside the app. That is why the installed
 *      Billy silently copied where the web one had offered WhatsApp — the code asked for a sheet
 *      the shell had never heard of and fell through to the clipboard every time.
 *   2. navigator.share, in a real browser that has it. Android Chrome and iOS Safari both do.
 *   3. The clipboard, which is always something, even if it makes the person find their own
 *      WhatsApp.
 *
 * Never throws. A share that fails is a summary that did not travel, not a crash.
 */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text });
      return "shared";
    } catch (err) {
      // Dismissing the sheet rejects on Android exactly as it does on the web. Nothing went wrong:
      // the person looked at their options and decided not to. Falling through to the clipboard
      // here would paste over whatever they had copied as a reward for changing their mind.
      if (err instanceof Error && /cancel|abort/i.test(err.message)) return "shared";
      // anything else — plugin missing, no app to share to — falls through to the clipboard
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared"; // user closed the sheet — done
      // other failures fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed"; // clipboard missing (insecure context) or permission denied
  }
}
