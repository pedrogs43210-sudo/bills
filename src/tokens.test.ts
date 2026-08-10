import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The design tokens, checked against the code that uses them.
 *
 * This exists because of a silent bug: four places asked for `var(--warn)` — the colour of
 * "Delete trip" and of the two group-name warnings — and the token was never defined. CSS
 * swallows that. The declarations were simply dropped, so the one irreversible button in the app
 * was the same colour as everything else, and nothing failed anywhere.
 *
 * Colour *values* are not asserted here. Contrast is measured in a real browser, against real
 * surfaces, because a ratio computed from a hex pair in a test cannot see what is actually behind
 * the text. What this file guards is that the tokens exist, in both themes, and that the ones
 * fixed for legibility are not quietly reverted to the values that failed.
 */

const css = readFileSync(join(__dirname, "theme.css"), "utf8");

/** The custom properties declared in a block, e.g. `:root` or `:root[data-theme="dark"]`. */
function declaredIn(selector: string): Set<string> {
  const start = css.indexOf(selector + " {");
  expect(start, `${selector} block not found`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n}", start));
  return new Set([...block.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
}

/**
 * Properties set at runtime rather than declared in the stylesheet, with where they come from.
 * Anything not on this list has to be declared, or it is the --warn bug again.
 */
const SET_IN_CODE: Record<string, string> = {
  "--footer-h": "components/Footerbar.tsx measures the bar and publishes it",
  "--person": "components/chips.tsx personVars(), a person's own colour",
  "--person-ink": "components/chips.tsx personVars(), the disc colour derived from it",
};

describe("the design tokens", () => {
  const light = declaredIn(":root");
  const dark = declaredIn(':root[data-theme="dark"]');

  it("defines every property the stylesheet and the screens ask for", () => {
    const used = new Set<string>();
    const collect = (text: string) => {
      for (const m of text.matchAll(/var\((--[\w-]+)/g)) used.add(m[1]);
    };
    collect(css);
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) collect(readFileSync(path, "utf8"));
      }
    };
    walk(__dirname);

    const missing = [...used].filter((name) => !light.has(name) && !(name in SET_IN_CODE));
    expect(missing, "asked for but never defined — CSS drops these silently").toEqual([]);
  });

  it("gives dark mode its own value for every colour that needs one", () => {
    // Sizes, radii and fonts are shared; anything to do with colour has to be reconsidered, and
    // --ink-3 is here because it was left at the light value and measured 2.83:1 on dark surfaces.
    for (const name of ["--bg", "--surface", "--sunken", "--line", "--line-strong", "--ink", "--ink-2", "--ink-3", "--accent", "--accent-ink", "--warn", "--good", "--note"]) {
      expect(light.has(name), `${name} missing from light`).toBe(true);
      expect(dark.has(name), `${name} missing from dark`).toBe(true);
    }
  });

  it("keeps the accent's text colour distinct from its fill colour", () => {
    // The brand accent is a 3:1 colour — right for rings, dots and bars, too pale for 15px words.
    expect(css).toMatch(/\.btn-ghost\s*\{[^}]*color:\s*var\(--accent-ink\)/);
  });

  it("does not put white back on the sunset gradient", () => {
    // 2.72:1 at the red end and 1.78:1 at the amber end: the most important label in the app.
    const primary = css.slice(css.indexOf(".btn-primary {"));
    const block = primary.slice(0, primary.indexOf("}"));
    expect(block).not.toMatch(/color:\s*(#fff|#ffffff|white)\b/i);
  });

  it("keeps note bodies in ink rather than in the accent colour", () => {
    // Amber-on-cream measured 3.24:1 and green-on-mint 2.92:1.
    const note = css.slice(css.indexOf(".note {"));
    expect(note.slice(0, note.indexOf("}"))).toMatch(/color:\s*var\(--ink\)/);
  });
});
