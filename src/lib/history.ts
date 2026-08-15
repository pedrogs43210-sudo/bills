import type { View } from "../App";

/**
 * A back stack for the app's screens.
 *
 * The app navigates by replacing one `View` with another, which is fine on the web — the browser
 * has no history to honour because nothing changes the URL. On Android it is not fine: the
 * hardware back button is expected to go back, and an app that closes instead of returning to the
 * previous screen is both a bad app and a thing Play reviewers notice.
 *
 * Kept as pure functions so the behaviour can be tested without a device.
 */

export type Nav = { current: View; stack: View[] };

export function initialNav(view: View = { screen: "trips" }): Nav {
  return { current: view, stack: [] };
}

/** Same screen, same target — tapping the trip you are already on should not stack a duplicate. */
function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Move to a screen, remembering where we were.
 *
 * Going back to a screen already in the stack unwinds to it rather than growing the stack, so
 * bouncing between a trip and a receipt a dozen times does not need a dozen back presses to
 * escape.
 */
export function navigate(nav: Nav, next: View): Nav {
  if (sameView(nav.current, next)) return nav;
  const existing = nav.stack.findIndex((v) => sameView(v, next));
  if (existing !== -1) return { current: next, stack: nav.stack.slice(0, existing) };
  return { current: next, stack: [...nav.stack, nav.current] };
}

/** Step back. Returns null when there is nowhere left to go, which is when the app should close. */
export function back(nav: Nav): Nav | null {
  if (nav.stack.length === 0) return null;
  const stack = nav.stack.slice();
  const current = stack.pop()!;
  return { current, stack };
}

/**
 * The splits list is home: from anywhere else — including the profile tab — back should reach it
 * rather than exiting. Only from home itself does back mean "close the app".
 *
 * Profile is a tab root but deliberately not a second home. Android's convention is that back walks
 * you to one place and then out, and an app you cannot leave from the tab you happen to be standing
 * on is one people press back on four times and then force-quit.
 */
export function isHome(view: View): boolean {
  return view.screen === "trips";
}
