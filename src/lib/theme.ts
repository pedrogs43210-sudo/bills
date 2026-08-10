const KEY = "bills.theme.v1";

export type ThemeChoice = "auto" | "light" | "dark";

/**
 * Light and dark, with an explicit choice as well as following the phone.
 *
 * "Auto" is the default and what most people want, but it is not sufficient on its own: a phone
 * set to dark all day still gets used at a sunny kitchen table, and the person who wants the
 * bright version there should not have to change a system setting to get it.
 *
 * The resolved theme is written to `data-theme` on the root element, and the stylesheet has
 * exactly one dark block keyed off it — rather than a `prefers-color-scheme` block *and* an
 * override block, which is two copies of sixteen colours waiting to drift apart. A tiny inline
 * script in index.html applies it before first paint so there is no flash of the wrong theme.
 */
export function themeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

/** What "auto" currently means on this device. */
export function systemIsDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(choice: ThemeChoice = themeChoice()): "light" | "dark" {
  return choice === "auto" ? (systemIsDark() ? "dark" : "light") : choice;
}

/** Writes the resolved theme where the stylesheet can see it. */
export function applyTheme(choice: ThemeChoice = themeChoice()): void {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the choice lasts for this session, which beats refusing to change it.
  }
  applyTheme(choice);
}

/**
 * Keeps "auto" honest when the phone flips at sunset. Returns a cleanup function; does nothing
 * when a theme has been chosen explicitly, since then the phone's opinion is not wanted.
 */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (themeChoice() === "auto") applyTheme("auto");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
