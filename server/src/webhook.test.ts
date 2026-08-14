import { describe, it, expect } from "vitest";
import { interpretEvent } from "./webhook";
import { PACKS } from "../../src/lib/packs";

/**
 * Reading a purchase notification.
 *
 * The thing being pinned here is what the endpoint refuses. Granting scans is easy; the value is in
 * everything that must not result in somebody being handed something for nothing.
 */

const pack = PACKS.find((p) => p.scans === 20)!;

/** A notification shaped like the ones RevenueCat sends for a consumable. */
const event = (over: Record<string, unknown> = {}) => ({
  event: {
    type: "NON_RENEWING_PURCHASE",
    id: "evt_01HXYZ",
    app_user_id: "c2987a1a-9bfe-444b-b159-332468f72103",
    product_id: pack.id,
    ...over,
  },
});

describe("a purchase", () => {
  it("grants exactly what the catalogue says, never what the message says", () => {
    // The most important line in this file. A payload claiming ten thousand scans is a payload
    // from somebody who should not be listened to; the number comes from PACKS, keyed by product.
    const outcome = interpretEvent(event({ scans: 10000, credits: 10000, amount: 999 }));
    expect(outcome).toEqual({
      kind: "grant",
      installId: "c2987a1a-9bfe-444b-b159-332468f72103",
      scans: pack.scans,
      eventId: "evt_01HXYZ",
      productId: pack.id,
    });
  });

  it("grants every pack in the catalogue, at its own size", () => {
    for (const p of PACKS) {
      const outcome = interpretEvent(event({ product_id: p.id }));
      expect(outcome).toMatchObject({ kind: "grant", scans: p.scans });
    }
  });
});

describe("a refund", () => {
  it("takes the same number back", () => {
    for (const type of ["REFUND", "CANCELLATION"]) {
      expect(interpretEvent(event({ type }))).toMatchObject({ kind: "revoke", scans: pack.scans });
    }
  });
});

describe("what it refuses to act on", () => {
  it("ignores a product it does not sell", () => {
    // Somebody else's product id, or one we retired: neither has a number of scans attached, and
    // guessing would be inventing money.
    expect(interpretEvent(event({ product_id: "app.billy.scans.999" }))).toEqual({
      kind: "ignore",
      why: "unknown product app.billy.scans.999",
    });
  });

  it("ignores an app_user_id that is not an install id", () => {
    // RevenueCat issues its own anonymous ids. One of those means the app bought something before
    // it identified itself, which is a bug to see rather than a purchase to guess at.
    for (const id of ["$RCAnonymousID:8e3a1f", "", null, 42, "pedro@example.com"]) {
      expect(interpretEvent(event({ app_user_id: id })).kind).toBe("ignore");
    }
  });

  it("ignores an event with no id, because there would be no way to spot a replay", () => {
    expect(interpretEvent(event({ id: "" })).kind).toBe("ignore");
    expect(interpretEvent(event({ id: undefined })).kind).toBe("ignore");
  });

  it("ignores event types it does not handle, and says which", () => {
    const outcome = interpretEvent(event({ type: "SUBSCRIPTION_PAUSED" }));
    expect(outcome).toEqual({ kind: "ignore", why: "unhandled type SUBSCRIPTION_PAUSED" });
  });

  it("answers a dashboard test event calmly", () => {
    // Pressing "send test event" is how you find out the URL and the secret are right. It must not
    // look like a failure.
    expect(interpretEvent(event({ type: "TEST" }))).toEqual({ kind: "ignore", why: "test event" });
  });

  it("survives rubbish without throwing", () => {
    for (const junk of [null, undefined, "", 7, [], {}, { event: null }, { event: "hello" }, { event: {} }]) {
      expect(interpretEvent(junk).kind).toBe("ignore");
    }
  });

  it("does not treat a subscription event as a pack", () => {
    // INITIAL_PURCHASE is recognised as a purchase, but no subscription product is in the
    // catalogue, so it still resolves to nothing rather than to an arbitrary number of scans.
    const outcome = interpretEvent(event({ type: "INITIAL_PURCHASE", product_id: "app.billy.plus.year" }));
    expect(outcome.kind).toBe("ignore");
  });
});
