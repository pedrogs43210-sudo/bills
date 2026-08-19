import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

/**
 * How long findBy* waits before giving up.
 *
 * The library's default is one second, chosen for apps whose screens appear as fast as the code can
 * render them. Billy deliberately holds the "Got it" tick for SCAN_DONE_MS after a scan succeeds,
 * so the review screen is a beat behind the scan by design — at the default, eleven tests failed on
 * a hold that was working exactly as intended. Raised rather than patched at each call site: the
 * alternative is every test that scans carrying a timeout argument that restates a fact about the
 * app, and the next such pause failing them all again.
 *
 * A test that genuinely hangs still fails; it just takes three seconds to say so.
 */
configure({ asyncUtilTimeout: 3000 });

/**
 * jsdom has no layout, so it has no scrolling: calling scrollTo or scrollBy prints
 * "Not implemented" to the console and does nothing. The app scrolls in two places — bringing a
 * held item back above the selection panel, and bringing the new-trip form into view — and neither
 * is something a jsdom test could observe anyway. Stubbed here so the noise does not bury a real
 * failure, and so no screen has to know whether it is being tested.
 */
window.scrollTo = () => {};
window.scrollBy = () => {};

afterEach(() => {
  cleanup();
});
