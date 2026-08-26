import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Mark, markFor, MARK_GEOMETRY } from "./Mark";

/** The two <rect>s, in document order: long bar first, short bar second. */
function bars(size: number, props: Record<string, unknown> = {}) {
  const { container } = render(<Mark size={size} {...props} />);
  const svg = container.querySelector("svg")!;
  const [long, short] = [...container.querySelectorAll("rect")];
  return { svg, long, short };
}
const num = (el: Element, a: string) => Number(el.getAttribute(a));

describe("the mark's geometry", () => {
  it("never draws two equal bars", () => {
    // The one thing the mark exists to not say. An even split contradicts the product.
    for (const g of Object.values(MARK_GEOMETRY)) {
      expect(g.short.w).toBeLessThan(g.long.w);
    }
  });

  it("keeps the lengths at roughly 63/37, never 50/50", () => {
    for (const g of Object.values(MARK_GEOMETRY)) {
      const ratio = g.short.w / g.long.w;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(0.62);
    }
  });

  it("hangs the short bar from the left edge", () => {
    // Right-aligning or centring it is one of the sheet's explicit don'ts.
    for (const g of Object.values(MARK_GEOMETRY)) {
      expect(g.short.x).toBe(g.long.x);
    }
  });

  it("draws true pills — radius is always half the bar height", () => {
    // Reducing the radius is a don't: half-height pills or nothing, so the ends never look clipped.
    for (const size of [16, 20, 24, 32, 48]) {
      const { long, short } = bars(size);
      expect(num(long, "rx")).toBe(num(long, "height") / 2);
      expect(num(short, "rx")).toBe(num(short, "height") / 2);
    }
  });

  it("keeps the bars level", () => {
    // Rotating it is a don't — level bars are what make it read as a glyph.
    for (const size of [16, 32]) {
      const { svg } = bars(size);
      expect(svg.getAttribute("transform")).toBeNull();
      expect(svg.getAttribute("style") ?? "").not.toMatch(/rotate/);
    }
  });
});

describe("choosing a drawing", () => {
  it("switches to compact at 24px and below", () => {
    // A measurement, not a preference: at 16px the regular bars are 2.4px and compact ones 3.6px.
    expect(markFor(16)).toBe("compact");
    expect(markFor(24)).toBe("compact");
    expect(markFor(25)).toBe("regular");
    expect(markFor(32)).toBe("regular");
  });

  it("gives the compact drawing thicker bars at the same width", () => {
    const r = MARK_GEOMETRY.regular;
    const c = MARK_GEOMETRY.compact;
    expect(c.long.w).toBe(r.long.w); // same width
    expect(c.long.h).toBeGreaterThan(r.long.h); // more ink
  });
});

describe("how it renders", () => {
  it("is wide, not square — height follows the ratio", () => {
    // A caller reserving a square box gets a bar floating in whitespace, so this is load-bearing.
    const { svg } = bars(44);
    expect(num(svg, "width")).toBe(44);
    expect(num(svg, "height")).toBeCloseTo(24, 1);
  });

  it("is one inherited colour unless a split is asked for", () => {
    // The tab bar depends on this: one element, and the selected state costs no extra rule.
    const { long, short } = bars(20);
    expect(long.getAttribute("fill")).toBe("currentColor");
    expect(short.getAttribute("fill")).toBe("currentColor");
  });

  it("puts the accent on the short bar only", () => {
    const { long, short } = bars(32, { color: "var(--ink)", accent: "var(--accent)" });
    expect(long.getAttribute("fill")).toBe("var(--ink)");
    expect(short.getAttribute("fill")).toBe("var(--accent)");
  });

  it("stays out of the accessibility tree unless it is given a name", () => {
    const { svg } = bars(24);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const named = bars(24, { title: "Billy" });
    expect(named.svg.getAttribute("aria-label")).toBe("Billy");
    expect(named.svg.getAttribute("aria-hidden")).toBeNull();
  });
});
