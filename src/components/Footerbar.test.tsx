import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Footerbar } from "./Footerbar";

afterEach(cleanup);

/**
 * The bar reserves its own space.
 *
 * The page used to pad a hard-coded 140px for it while the trip screen's bar measured 172px, so
 * "Delete trip" and the last receipt sat under it, unreachable at any scroll position. jsdom gives
 * every element a height of 0, so what these tests can prove is the wiring — that the property is
 * published while the bar is mounted and taken away when it goes — not the arithmetic, which is
 * measured in a real browser instead.
 */
describe("the footer bar reserving its own space", () => {
  const footerH = () => document.documentElement.style.getPropertyValue("--footer-h");

  it("publishes its height for the page to pad with", () => {
    render(<Footerbar><button>Scan receipt</button></Footerbar>);
    expect(footerH()).toBe("0px"); // jsdom lays nothing out; the point is that it is set
  });

  it("takes the reservation away when the bar goes", () => {
    const view = render(<Footerbar><button>Scan receipt</button></Footerbar>);
    expect(footerH()).not.toBe("");
    view.unmount();
    // A screen with no bar must not keep padding for one, or it grows a dead strip at the bottom.
    expect(footerH()).toBe("");
  });

  it("renders its actions, and only inside the bar", () => {
    const { getByRole, container } = render(
      <Footerbar>
        <button>Done</button>
      </Footerbar>
    );
    const bar = container.querySelector(".footerbar");
    expect(bar).not.toBeNull();
    expect(bar!.contains(getByRole("button", { name: "Done" }))).toBe(true);
  });

  it("copes with a browser that has no ResizeObserver", () => {
    const real = globalThis.ResizeObserver;
    // @ts-expect-error — deliberately removing it, which is the situation being tested
    delete globalThis.ResizeObserver;
    try {
      const view = render(<Footerbar><button>Scan</button></Footerbar>);
      expect(footerH()).toBe("0px"); // measured once, just never re-measured
      view.unmount();
      expect(footerH()).toBe("");
    } finally {
      globalThis.ResizeObserver = real;
    }
  });
});
