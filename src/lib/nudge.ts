/**
 * Says "not that" to a control that cannot do what was just asked of it.
 *
 * A short shake and, on a phone that has one, a short buzz. It exists because "Create split" used
 * to `return` on an empty name: the tap landed, the button pressed, and nothing happened and
 * nothing explained itself. A control that answers silently is indistinguishable from a broken one,
 * and the person's next move is to tap it harder.
 *
 * Deliberately paired with a sentence rather than replacing one. The shake says something is wrong
 * and the buzz says it to somebody looking at the table instead of the phone, but neither says
 * WHAT, so neither is the whole answer.
 */

/** How long the shake runs. Matches the `nudge-shake` keyframes in theme.css. */
export const NUDGE_MS = 320;

/**
 * A buzz, where there is a motor and permission to use it.
 *
 * `navigator.vibrate` is the free version: it works in the Android WebView the app ships in, and
 * does nothing at all on iOS, where the API does not exist. Feature-detected rather than assumed,
 * and wrapped because a browser may also refuse it outright — Chrome throws if the page has never
 * been interacted with, and a failed buzz must never take the error message down with it.
 *
 * Not @capacitor/haptics, which would do this properly on both platforms. That is a dependency, a
 * native pod and a Gradle entry for one buzz on one screen; worth adding the first time iOS needs
 * to feel something, and not before.
 */
function buzz(): void {
  try {
    // 12ms is a tick, not an alert. Long enough to register in the hand, short enough that
    // somebody who mistyped twice does not feel told off.
    navigator.vibrate?.(12);
  } catch {
    /* no motor, no permission, or a browser that changed its mind — none of it matters here */
  }
}

/**
 * Shake an element and buzz the phone.
 *
 * The class is removed first and the frame forced, because re-adding a class that is already there
 * does not restart a CSS animation — so the second failed attempt in a row would sit perfectly
 * still, which is precisely the attempt that most needs an answer.
 */
export function nudge(el: HTMLElement | null): void {
  buzz();
  if (!el) return;
  el.classList.remove("nudge");
  // Reading a layout property flushes the removal, so adding it back is a genuine change.
  void el.offsetWidth;
  el.classList.add("nudge");
  window.setTimeout(() => el.classList.remove("nudge"), NUDGE_MS);
}
