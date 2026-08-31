import { describe, it, expect } from "vitest";
import { SPLIT_ICONS, DEFAULT_ICON, iconFor } from "./splitIcons";

/**
 * The icon set, and the one rule that makes it safe to have replaced emoji at all.
 *
 * The stored value did not change: `trip.emoji` is still an emoji, and the icon is looked up from
 * it at render time. That is what lets a split created last summer keep working, and what lets the
 * summary pasted into a group chat still say something — an SVG cannot go in a text message.
 */
describe("the split icon set", () => {
  it("has an emoji for every icon, and no two the same", () => {
    // The emoji is the lookup key as well as the plain-text twin, so a duplicate would silently
    // make one of the two icons unreachable.
    const emoji = SPLIT_ICONS.map((i) => i.emoji);
    expect(new Set(emoji).size).toBe(SPLIT_ICONS.length);
    expect(emoji.every((e) => e.length > 0)).toBe(true);
  });

  it("has a unique kebab-case name for every icon", () => {
    const names = SPLIT_ICONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("leads with a restaurant bill and a supermarket shop", () => {
    // The order is the design's, and it is doing real work: the old set was six holidays out of
    // seven, so the two commonest reasons to open Billy had no icon at all.
    expect(SPLIT_ICONS[0].name).toBe("dinner");
    expect(SPLIT_ICONS[1].name).toBe("groceries");
  });

  it("draws every icon from at least one shape, on the shared 24-grid", () => {
    for (const icon of SPLIT_ICONS) {
      expect(icon.shapes.length, icon.name).toBeGreaterThan(0);
      for (const s of icon.shapes) {
        if (s.kind === "path") expect(s.d, icon.name).toMatch(/^M/);
        else {
          // Inside the box with room for the stroke, or it clips at the viewBox edge.
          expect(s.cx - s.r, icon.name).toBeGreaterThanOrEqual(0);
          expect(s.cx + s.r, icon.name).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});

describe("finding the icon for a stored emoji", () => {
  it("round-trips every icon in the set", () => {
    for (const icon of SPLIT_ICONS) expect(iconFor(icon.emoji)).toBe(icon);
  });

  it("keeps splits made before this set existed", () => {
    // 🏕️ was the old camping glyph and 🎉 a party popper the new set drops. Both are sitting in
    // real storage and on the server right now, so both have to resolve to something forever.
    expect(iconFor("\u{1F3D5}\u{FE0F}").name).toBe("camping");
    expect(iconFor("\u{1F389}")).toBe(DEFAULT_ICON);
  });

  it("carries the old holiday emoji straight across", () => {
    // These four survived the redesign unchanged, so every existing split keeps its own picture.
    expect(iconFor("\u{1F3D6}\u{FE0F}").name).toBe("beach");
    expect(iconFor("⛰\u{FE0F}").name).toBe("mountains");
    expect(iconFor("\u{1F3D9}\u{FE0F}").name).toBe("city");
    expect(iconFor("\u{1F3BF}").name).toBe("ski");
  });

  it("never returns nothing, whatever it is handed", () => {
    // Called while rendering a split from a hand-edited export file, or from a future build.
    for (const junk of ["", "  ", "\u{1F984}", "not an emoji", undefined, null]) {
      expect(iconFor(junk as string)).toBe(DEFAULT_ICON);
    }
  });
});
