import type { SharedSplitView } from "./sharedSplit";

/**
 * The guest's own copy of a split they joined.
 *
 * The server's copy of a shared split is a postbox, not a record: it exists so a few phones can
 * read the same receipt for a few days, and it is swept after a week so Billy is not quietly
 * holding a file of where everybody ate. That is a deliberate privacy position and it is not
 * changing.
 *
 * But it left guests worse off than hosts. The host keeps the split on their phone forever; the
 * guest, who tapped through the same twenty items, had nothing at all once the postbox emptied —
 * not even the receipt they had just been asked to check. So the guest keeps a copy too, here, on
 * their own phone, written every time the split is read successfully and never touched again after
 * the link dies.
 *
 * It is a snapshot rather than a live thing. Once the link expires the copy stops updating,
 * because there is nothing left to update it from — which is honest, and is what the screen says.
 *
 * The `bills.` prefix is not cosmetic: it is the prefix every other key on the phone already uses,
 * and a tidier one would orphan what people are carrying.
 */
const KEPT_KEY = "bills.share.kept";

export type KeptSplit = {
  code: string;
  view: SharedSplitView;
  /** When this snapshot was taken, ISO. Shown so nobody mistakes a frozen copy for a live one. */
  keptAt: string;
};

function readAll(): Record<string, KeptSplit> {
  try {
    const raw = localStorage.getItem(KEPT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, KeptSplit>)
      : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, KeptSplit>): void {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(map));
  } catch {
    // Storage full. The guest loses the archive copy, not the split in front of them — this is
    // never worth interrupting somebody in the middle of ticking off their dinner.
  }
}

/** Take a snapshot. Called on every successful read, so the copy tracks the split while it lives. */
export function keepSplit(code: string, view: SharedSplitView): void {
  writeAll({ ...readAll(), [code]: { code, view, keptAt: new Date().toISOString() } });
}

/** The snapshot for one code, if this phone ever saw it. */
export function keptSplit(code: string): KeptSplit | null {
  return readAll()[code] ?? null;
}

/** Every split this phone has joined, newest snapshot first. */
export function keptSplits(): KeptSplit[] {
  return Object.values(readAll()).sort((a, b) => b.keptAt.localeCompare(a.keptAt));
}

/** Theirs to delete. Nothing else removes these — an expiry that wipes them is the bug. */
export function forgetKeptSplit(code: string): void {
  const map = readAll();
  delete map[code];
  writeAll(map);
}
