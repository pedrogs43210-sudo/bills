import type { Pack } from "./packs";
import { installId } from "./installId";

/**
 * The seam where money changes hands, through RevenueCat.
 *
 * No card details pass through this code and none of these functions is ever trusted about what
 * somebody owns. A purchase ends with RevenueCat posting a webhook to the Worker, which looks the
 * product up in its own copy of `PACKS` and adds the scans server-side. `buyPack` returning
 * "bought" means the store took the money, not that the scans exist — the caller then waits for
 * the server's balance to rise (see lib/awaitCredits.ts). A client that can say "I bought 60
 * scans" is a client that can say it a hundred times.
 *
 * One SDK for both stores, deliberately: StoreKit and Play Billing disagree about almost
 * everything, and the alternative is two purchase paths that have to be debugged separately in two
 * review queues. What differs per platform here is one public key.
 */

export type PurchaseOutcome =
  | { kind: "bought"; scansAdded: number }
  | { kind: "restored"; found: boolean }
  | { kind: "cancelled" }
  | { kind: "unavailable"; why: string }
  | { kind: "failed"; why: string };

/**
 * RevenueCat's public SDK keys, one per store.
 *
 * Public is the right word: these identify the app to RevenueCat and are designed to ship inside
 * the binary, unlike the Worker's APP_TOKEN or the Anthropic key. They are read from the build
 * environment anyway so a fork does not inherit them and so a key can be rotated without a code
 * change.
 */
const KEY_IOS = import.meta.env.VITE_RC_KEY_IOS ?? "";
const KEY_ANDROID = import.meta.env.VITE_RC_KEY_ANDROID ?? "";

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const cap = (): Cap | undefined => (globalThis as { Capacitor?: Cap }).Capacitor;
const isNative = (): boolean => typeof cap()?.isNativePlatform === "function" && cap()!.isNativePlatform!();
const platform = (): string => cap()?.getPlatform?.() ?? "web";

/** The key for whichever store this build is running against. Empty means "not configured". */
function apiKey(): string {
  return platform() === "ios" ? KEY_IOS : platform() === "android" ? KEY_ANDROID : "";
}

/**
 * Whether buying is possible at all here.
 *
 * False in a browser, because a web page cannot open the App Store's payment sheet. That is a fact
 * about the build, not something to tell anybody: Billy is a phone app, and the web version exists
 * only so this can be developed and tested. No copy anywhere mentions it — a user reading about a
 * "web version" would rightly wonder which app they had installed.
 *
 * Also false when this build has no key for its store, which is what a fork or a local debug build
 * gets. An honest sentence beats a button that opens nothing.
 */
export function canBuy(): boolean {
  return isNative() && apiKey() !== "";
}

/** Why buying is not possible, in words for a person rather than a state name. */
export function whyCannotBuy(): string {
  return "Scan packs aren't ready to buy yet — nothing is being asked of you today.";
}

/**
 * Configure once, lazily, on the first purchase or restore.
 *
 * Lazily because most launches never touch this: somebody opening Billy to look at last week's
 * split should not pay the cost of starting a payments SDK. Idempotent because the pack chooser
 * appears on two screens and nothing coordinates them.
 *
 * `appUserID` is the install id and that is load-bearing rather than convenient — it is the only
 * thing tying a payment to a row in the Worker's database, and the webhook drops any event whose
 * app_user_id is not a UUID rather than guessing whose purchase it was.
 */
let configured: Promise<void> | null = null;
function ensureConfigured(): Promise<void> {
  if (!configured) {
    configured = (async () => {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      await Purchases.configure({ apiKey: apiKey(), appUserID: installId() });
    })().catch((err) => {
      // A failed configure must not be cached as done, or every later attempt fails silently
      // against a half-initialised SDK.
      configured = null;
      throw err;
    });
  }
  return configured;
}

/** RevenueCat reports a user backing out as an error with a flag, not as a resolved value. */
function wasCancelled(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { userCancelled?: boolean }).userCancelled === true;
}

/** Whatever the store said, as one line, without leaking an error code at somebody. */
function readable(err: unknown): string {
  const m = typeof err === "object" && err !== null ? (err as { message?: string }).message : undefined;
  return m && m.length < 160 ? m : "That didn't go through. Nothing has been charged.";
}

/**
 * Start the platform's purchase sheet for one pack.
 *
 * The scans reported back come from `PACKS`, never from the store's own metadata — the same rule
 * the Worker follows. A store product's title could say anything; the catalogue is the catalogue.
 * This number is only ever used to word a sentence, since the balance itself comes from the server.
 */
export async function buyPack(pack: Pack): Promise<PurchaseOutcome> {
  if (!canBuy()) return { kind: "unavailable", why: whyCannotBuy() };
  try {
    await ensureConfigured();
    const { Purchases, PRODUCT_CATEGORY } = await import("@revenuecat/purchases-capacitor");
    const { products } = await Purchases.getProducts({
      productIdentifiers: [pack.id],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    const product = products.find((p) => p.identifier === pack.id);
    if (!product) {
      // The commonest cause by far is a product that exists in PACKS but has not been created —
      // or not yet approved — in App Store Connect or the Play Console. Worth its own sentence,
      // because "that didn't work" would send somebody hunting in the wrong place.
      return { kind: "unavailable", why: "That pack isn't available from the store yet." };
    }
    await Purchases.purchaseStoreProduct({ product });
    return { kind: "bought", scansAdded: pack.scans };
  } catch (err) {
    if (wasCancelled(err)) return { kind: "cancelled" };
    return { kind: "failed", why: readable(err) };
  }
}

/**
 * Ask the store what this account has already paid for.
 *
 * Both stores require this to exist, and for a consumable it does less than people expect: a pack
 * that was bought and spent is gone, and restoring cannot bring back scans that were used. What it
 * does recover is a purchase the store took payment for and never finished delivering — a webhook
 * lost to a dead connection, an app killed mid-transaction — which is the case that actually
 * strands somebody who has paid.
 *
 * So it reports whether anything came back rather than a number, and the caller waits on the
 * server's balance exactly as it does after a purchase. The scans, as always, come from the Worker.
 */
export async function restorePurchases(): Promise<PurchaseOutcome> {
  if (!canBuy()) return { kind: "unavailable", why: whyCannotBuy() };
  try {
    await ensureConfigured();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    const found = (customerInfo.nonSubscriptionTransactions ?? []).length > 0;
    return { kind: "restored", found };
  } catch (err) {
    if (wasCancelled(err)) return { kind: "cancelled" };
    return { kind: "failed", why: readable(err) };
  }
}
