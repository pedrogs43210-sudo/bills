import { useSyncExternalStore } from "react";
import { canBuy } from "./purchase";
import type { ScanQuota } from "./scan";

/**
 * When to offer scan packs, and the memory of having been told no.
 *
 * Pure rules in their own file, for the same reason the quota rules are: this decides when to
 * interrupt somebody, and the whole thing should be arguable in tests rather than discovered by a
 * user standing in a restaurant.
 *
 * Two principles shape all of it.
 *
 * **Never interrupt the thing they came to do.** The offer arrives after a scan has landed and the
 * items are on screen — not before the camera opens, and never while friends are waiting on a
 * split. The same words a few seconds later cost nothing in goodwill and are read by somebody who
 * has just watched the app work.
 *
 * **A no is remembered.** Not forever — someone who declined last month and is out of scans again
 * is a different person from someone who declined thirty seconds ago — but for as long as the thing
 * they said no to is still in front of them. An offer that reappears on every tap is not a better
 * offer; it is the same offer, resented.
 */

/** The moments at which packs may be offered. */
export type PromoMoment =
  /** A scan just landed and it was the last one. Peak proof, and a real problem to solve. */
  | "last-scan"
  /** A split has just been finished. Nothing is blocked; this is the app at its most useful. */
  | "after-settle";

/**
 * Below this many scans left, the after-settle offer appears.
 *
 * Two rather than zero deliberately: at zero the next scan is already blocked and the paywall will
 * say so anyway, which makes a second ask redundant. The moment worth buying at is just before the
 * wall, not at it.
 */
export const LOW_SCANS = 2;

/* Same `bills.` prefix as every other key. The app's name changed; the storage did not, and a
   tidier prefix would silently orphan what is already on people's phones. */
const SEEN_KEY = "bills.promo.declined";

/** Every offer this install has declined, keyed by moment and by the thing it was about. */
function declined(): Record<string, true> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, true>)
      : {};
  } catch {
    return {}; // a promo is never worth an exception
  }
}

const slot = (moment: PromoMoment, about: string) => `${moment}:${about}`;

/**
 * Remember that this offer was declined.
 *
 * `about` is what the offer was attached to — the receipt just scanned, or the trip just settled.
 * Scoping it that way is what makes "remembers the answer" mean the right thing: dismissing the
 * sheet on this receipt does not silence the next one, and does not silence it forever either.
 */
export function decline(moment: PromoMoment, about: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...declined(), [slot(moment, about)]: true }));
  } catch {
    // Storage full or unavailable. The cost is an offer shown twice, which is not worth a crash.
  }
}

export function wasDeclined(moment: PromoMoment, about: string): boolean {
  return declined()[slot(moment, about)] === true;
}

/**
 * Whether packs can be sold at all right now.
 *
 * `canBuy()` is false until the store products exist, and an offer that leads to "you can't buy
 * this yet" is worse than no offer — it spends the goodwill and returns nothing. The dev exception
 * exists so the screens can be designed and reviewed before there is a Play account to test with;
 * it is compiled out of a real build, so no user can ever meet it.
 */
export const promosPossible = (): boolean => canBuy() || import.meta.env?.DEV === true;

/**
 * Should an offer appear at this moment?
 *
 * Deliberately says no in every uncertain case. A subscriber has no cap and must never be sold a
 * pack; an install with no quota yet has not scanned, so there is nothing to have run out of.
 */
export function shouldOffer(
  moment: PromoMoment,
  about: string,
  quota: ScanQuota | null
): boolean {
  if (!promosPossible()) return false;
  if (quota === null || quota.left === null) return false; // no proxy, or a subscriber
  if (wasDeclined(moment, about)) return false;

  // Out of scans entirely: the wall itself is the ask, and this sheet is the softer version of it.
  if (moment === "last-scan") return quota.left <= 0;
  // Not blocked yet, and just saw the app be useful. The best-tempered moment in the whole app.
  return quota.left <= LOW_SCANS;
}

/* ---------- The pending offer ----------
 *
 * The sheet is decided on one screen and shown on another: the scan finishes on the trip screen and
 * the person is immediately sent to their new receipt, which is exactly where they should be when
 * the offer arrives. Rather than thread a callback through the router, the intention is parked here
 * and the router renders it — the same module-level pattern as `lastKnownQuota`, and for the same
 * reason: it outlives the component that produced it.
 */

let pending: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Show the sheet on whatever screen the person lands on next. `about` is what it concerns. */
export function offerAfter(about: string): void {
  pending = about;
  emit();
}

/** Put it away. Declining is recorded separately, by whoever knows which moment this was. */
export function clearOffer(): void {
  pending = null;
  emit();
}

export const pendingOffer = (): string | null => pending;

/** Subscribe the router to the pending offer. */
export function usePendingOffer(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    pendingOffer,
    // The server snapshot. This never runs in the app, but tests render without a DOM and React
    // insists on it being here rather than throwing at the moment it is missed.
    () => null
  );
}
