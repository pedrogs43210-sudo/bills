/**
 * Mark the first-launch splash as already played.
 *
 * The splash renders ahead of the introduction on a genuinely fresh install, so any test that
 * renders <App /> with empty storage sees the mark assembling rather than whatever it came to
 * assert. Tests that seed a trip never hit it — the splash is gated on having nothing at all.
 *
 * Call it AFTER localStorage.clear(), which is where most suites reset.
 */
export function skipSplash(): void {
  localStorage.setItem("bills.splashSeen.v1", "1");
}
