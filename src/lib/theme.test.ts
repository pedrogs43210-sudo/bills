import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { applyTheme, resolveTheme, setThemeChoice, themeChoice, watchSystemTheme } from "./theme";

/** Pretends the phone is in dark (or light) mode. */
function stubSystem(dark: boolean, listeners: { add: number; remove: number } = { add: 0, remove: 0 }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: dark && q.includes("dark"),
    media: q,
    addEventListener: () => listeners.add++,
    removeEventListener: () => listeners.remove++,
  }));
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("choosing a theme", () => {
  it("follows the phone by default, in both directions", () => {
    stubSystem(true);
    expect(themeChoice()).toBe("auto");
    expect(resolveTheme()).toBe("dark");

    stubSystem(false);
    expect(resolveTheme()).toBe("light");
  });

  it("lets a choice override the phone, which is the point of having one", () => {
    stubSystem(true); // phone is dark
    setThemeChoice("light");
    expect(themeChoice()).toBe("light");
    expect(resolveTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("goes back to following the phone when auto is chosen again", () => {
    stubSystem(true);
    setThemeChoice("light");
    setThemeChoice("auto");
    expect(localStorage.getItem("bills.theme.v1")).toBeNull(); // no stale value left behind
    expect(resolveTheme()).toBe("dark");
  });

  it("writes the resolved theme where the stylesheet can see it", () => {
    stubSystem(true);
    applyTheme("auto");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores a stored value it does not recognise rather than breaking", () => {
    stubSystem(false);
    localStorage.setItem("bills.theme.v1", "neon");
    expect(themeChoice()).toBe("auto");
    expect(resolveTheme()).toBe("light");
  });

  it("still changes the theme when storage cannot be written", () => {
    stubSystem(false);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    setThemeChoice("dark");
    // the choice does not persist, but it does apply for this session
    expect(document.documentElement.dataset.theme).toBe("dark");
    setItem.mockRestore();
  });

  it("copes with a browser that has no matchMedia at all", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(resolveTheme("auto")).toBe("light");
    expect(watchSystemTheme()).toBeInstanceOf(Function); // and returns a usable cleanup
  });
});

describe("following the phone as it changes", () => {
  it("subscribes and unsubscribes cleanly", () => {
    const counts = { add: 0, remove: 0 };
    stubSystem(true, counts);
    const stop = watchSystemTheme();
    expect(counts.add).toBe(1);
    stop();
    expect(counts.remove).toBe(1);
  });
});
