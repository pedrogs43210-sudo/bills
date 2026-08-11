import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

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
