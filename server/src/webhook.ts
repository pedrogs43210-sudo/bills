import { PACKS } from "../../src/lib/packs";

/**
 * Reading a purchase notification from RevenueCat.
 *
 * Pure, like the quota rules and for the same reason: this decides whether somebody is given
 * something they paid for, and every branch of it should be testable without a network, a store
 * account, or a real card.
 *
 * The one thing this file will not do is trust the client. A notification arrives from RevenueCat's
 * servers, is authenticated by a shared secret the app never sees, and names a product from our own
 * catalogue — the number of scans comes from `PACKS` here, never from the payload. A message that
 * says "give this person 10,000 scans" is a message from somebody who should not be listened to.
 */

/** What a notification means, once it has been understood. */
export type WebhookOutcome =
  | { kind: "grant"; installId: string; scans: number; eventId: string; productId: string }
  | { kind: "revoke"; installId: string; scans: number; eventId: string; productId: string }
  | { kind: "ignore"; why: string };

/**
 * Event types that mean somebody bought a pack.
 *
 * Scan packs are consumables, so `NON_RENEWING_PURCHASE` is the one that matters. The subscription
 * types are listed because a subscription may exist one day and an unhandled purchase is a person
 * who paid and got nothing — but they map to no pack today, so they fall through to ignored rather
 * than silently granting an arbitrary number of scans.
 */
const BOUGHT = new Set(["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE", "RENEWAL"]);

/**
 * Event types that mean the money went back.
 *
 * Both spellings are accepted deliberately. The exact wording is RevenueCat's to choose and has
 * changed before; treating an unrecognised refund as "ignore" would leave scans in the hands of
 * somebody who has been refunded, which is the expensive direction to be wrong in.
 */
const REFUNDED = new Set(["REFUND", "CANCELLATION", "REFUND_REVERSED_TO_CUSTOMER"]);

const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Turn a notification body into a decision.
 *
 * Anything unrecognised is ignored with a reason rather than rejected: a webhook that returns an
 * error gets retried, and retrying something we will never understand just fills a log. The reason
 * is returned so it can be seen in testing, when the exact shape of these events stops being
 * something read in documentation and becomes something observed.
 */
export function interpretEvent(body: unknown): WebhookOutcome {
  if (typeof body !== "object" || body === null) return { kind: "ignore", why: "not an object" };
  const event = (body as { event?: unknown }).event;
  if (typeof event !== "object" || event === null) return { kind: "ignore", why: "no event" };

  const { type, app_user_id: appUserId, product_id: productId, id } = event as Record<string, unknown>;

  if (typeof type !== "string") return { kind: "ignore", why: "no event type" };
  // RevenueCat sends these when you press the button in its dashboard. Answering them cheerfully
  // is how you find out the endpoint and the secret are right, so they must not look like failures.
  if (type === "TEST") return { kind: "ignore", why: "test event" };

  const buying = BOUGHT.has(type);
  const refunding = REFUNDED.has(type);
  if (!buying && !refunding) return { kind: "ignore", why: `unhandled type ${type}` };

  // The app sets this to the install id. An anonymous id means somebody bought something before
  // the app identified them, which is a bug worth seeing rather than a purchase worth guessing at.
  if (!isUuid(appUserId)) return { kind: "ignore", why: "app_user_id is not an install id" };
  if (typeof id !== "string" || id.length === 0) return { kind: "ignore", why: "no event id" };
  if (typeof productId !== "string") return { kind: "ignore", why: "no product id" };

  const pack = PACKS.find((p) => p.id === productId);
  if (!pack) return { kind: "ignore", why: `unknown product ${productId}` };

  return {
    kind: buying ? "grant" : "revoke",
    installId: appUserId,
    scans: pack.scans,
    eventId: id,
    productId,
  };
}
