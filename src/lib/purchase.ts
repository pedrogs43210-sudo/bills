import type { Pack } from "./packs";

/**
 * The seam where money changes hands.
 *
 * Nothing here takes a payment yet, and that is the point: the screens can be designed, built and
 * argued about now, and the day the store accounts exist this file is the only one that changes.
 * Everything above it — the paywall, the pack chooser, the settings card — already speaks the
 * right language.
 *
 * When it is implemented it will be through the platform's own purchase sheet (StoreKit on iOS,
 * Play Billing on Android). No card details will ever pass through this code, and none of these
 * functions will ever be trusted about what someone owns: a purchase ends with a store receipt
 * sent to the proxy, which verifies it with Apple or Google and adds the scans server-side. A
 * client that can say "I bought 60 scans" is a client that can say it a hundred times.
 */

export type PurchaseOutcome =
  | { kind: "bought"; scansAdded: number }
  | { kind: "cancelled" }
  | { kind: "unavailable"; why: string }
  | { kind: "failed"; why: string };

/**
 * Whether buying is possible at all here.
 *
 * False in a browser, because a web page cannot open the App Store's payment sheet. That is a fact
 * about the build, not something to tell anybody: Billy is a phone app, and the web version exists
 * only so this can be developed and tested. No copy anywhere mentions it — a user reading about a
 * "web version" would rightly wonder which app they had installed.
 */
export function canBuy(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const native = typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
  return native && IMPLEMENTED;
}

/**
 * Flipped to true when the store products exist and the purchase sheet is wired. Until then even
 * the native build says "not yet" rather than showing a button that cannot work — a dead button is
 * worse than an honest sentence.
 */
const IMPLEMENTED = false;

/** Why buying is not possible, in words for a person rather than a state name. */
export function whyCannotBuy(): string {
  return "Scan packs aren't ready to buy yet — nothing is being asked of you today.";
}

/** Start the platform's purchase sheet for one pack. */
export async function buyPack(pack: Pack): Promise<PurchaseOutcome> {
  void pack;
  return { kind: "unavailable", why: whyCannotBuy() };
}

/**
 * Ask the store what this account has already paid for.
 *
 * Both stores require this to exist: someone who buys on one phone and installs on another must be
 * able to get back what they paid for, and there is no account here to look them up by. The store
 * account they are already signed in to is the record.
 */
export async function restorePurchases(): Promise<PurchaseOutcome> {
  return { kind: "unavailable", why: whyCannotBuy() };
}
