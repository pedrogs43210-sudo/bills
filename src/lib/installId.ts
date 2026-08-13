const KEY = "bills.install.v1";

/**
 * A random id for this install, so the server has something to count the free trial against.
 *
 * Not an account and not a person: it identifies a copy of the app, nothing else. Reinstalling
 * produces a new one and a fresh allowance, which is accepted deliberately — at about a cent a
 * scan, that costs less than the users a sign-up wall would turn away.
 */
export function installId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode, or storage full. A per-session id still lets a scan through; the counter
    // just cannot follow them, which is better than refusing to scan at all.
    return crypto.randomUUID();
  }
}
