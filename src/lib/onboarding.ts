const KEY = "bills.onboarded.v1";

/**
 * Whether the first-run explanation has been seen.
 *
 * Errs towards *not* showing it: if storage cannot be read we say it has been seen, because
 * showing the introduction again to someone who has used the app for a year is worse than
 * skipping it for someone who is new.
 */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode or a full disk. They will see the introduction again next launch, which is
    // a small annoyance and not worth breaking the app over.
  }
}
