import { describe, it, expect, beforeEach, vi } from "vitest";
import { decline, wasDeclined, shouldOffer, LOW_SCANS, type PromoMoment } from "./promo";
import type { ScanQuota } from "./scan";

/**
 * When Billy is allowed to ask for money.
 *
 * Worth testing properly because every branch here is a decision to interrupt a person, and the
 * failure mode is not a stack trace — it is somebody being pestered at the worst possible moment
 * and deleting the app. The rules should be arguable here rather than discovered in a review.
 */

const quota = (over: Partial<ScanQuota> = {}): ScanQuota => ({
  used: 3,
  left: 0,
  limit: 3,
  credits: 0,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("the last-scan sheet", () => {
  it("appears when the scan that just landed was the last one", () => {
    expect(shouldOffer("last-scan", "receipt-1", quota({ left: 0 }))).toBe(true);
  });

  it("stays away while there are scans left", () => {
    // There is nothing to solve yet. An offer here is an advertisement, not an answer.
    expect(shouldOffer("last-scan", "receipt-1", quota({ left: 1 }))).toBe(false);
    expect(shouldOffer("last-scan", "receipt-1", quota({ left: 9 }))).toBe(false);
  });
});

describe("the after-settle card", () => {
  it("appears while the scans are nearly gone", () => {
    expect(shouldOffer("after-settle", "trip-1", quota({ left: LOW_SCANS }))).toBe(true);
    expect(shouldOffer("after-settle", "trip-1", quota({ left: 0 }))).toBe(true);
  });

  it("stays away from someone with plenty", () => {
    expect(shouldOffer("after-settle", "trip-1", quota({ left: LOW_SCANS + 1 }))).toBe(false);
  });
});

describe("what silences an offer", () => {
  it("never sells to a subscriber, who has no cap to run out of", () => {
    for (const moment of ["last-scan", "after-settle"] as PromoMoment[]) {
      expect(shouldOffer(moment, "x", quota({ left: null, limit: null }))).toBe(false);
    }
  });

  it("says nothing when there is no quota at all", () => {
    // No proxy configured, or nobody has scanned yet. Nothing has been used, so nothing ran out.
    expect(shouldOffer("last-scan", "x", null)).toBe(false);
    expect(shouldOffer("after-settle", "x", null)).toBe(false);
  });

  it("remembers a no for the thing it was about", () => {
    decline("last-scan", "receipt-1");
    expect(shouldOffer("last-scan", "receipt-1", quota())).toBe(false);
  });

  it("but only for that thing — the next receipt asks again", () => {
    // The whole point of "remembers the answer". Dismissing this sheet is not a lifetime opt-out,
    // and treating it as one loses a customer who was simply busy.
    decline("last-scan", "receipt-1");
    expect(shouldOffer("last-scan", "receipt-2", quota())).toBe(true);
  });

  it("keeps the two moments separate", () => {
    // Declining the sheet after a scan must not silence the card after a settle-up: they are
    // different questions asked at different times, and one no is not two.
    decline("last-scan", "trip-1");
    expect(shouldOffer("after-settle", "trip-1", quota())).toBe(true);
  });

  it("survives storage being unavailable", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    // A full localStorage must cost an offer shown twice, never a crash on the settle screen.
    expect(() => decline("last-scan", "receipt-1")).not.toThrow();
    setItem.mockRestore();
  });

  it("survives a corrupt record", () => {
    localStorage.setItem("bills.promo.declined", "not json at all");
    expect(wasDeclined("last-scan", "receipt-1")).toBe(false);
    expect(shouldOffer("last-scan", "receipt-1", quota())).toBe(true);
  });

  it("ignores a record of the wrong shape", () => {
    localStorage.setItem("bills.promo.declined", "[1,2,3]");
    expect(wasDeclined("last-scan", "receipt-1")).toBe(false);
  });
});

describe("the gate on whether packs can be bought at all", () => {
  it("says nothing in a real build until the store products exist", () => {
    // The one that matters most. canBuy() is false until RevenueCat is wired and the Play products
    // are live, and an offer that leads to "you can't buy this yet" is worse than no offer: it
    // spends the goodwill and returns nothing. DEV is stubbed off because it is true under test,
    // which would otherwise hide this rule entirely.
    vi.stubEnv("DEV", false);
    expect(shouldOffer("last-scan", "receipt-1", quota({ left: 0 }))).toBe(false);
    expect(shouldOffer("after-settle", "trip-1", quota({ left: 0 }))).toBe(false);
    vi.unstubAllEnvs();
  });

  it("but shows in development, so the screens can be designed before there is a store", () => {
    expect(shouldOffer("last-scan", "receipt-1", quota({ left: 0 }))).toBe(true);
  });
});

describe("the storage key", () => {
  it("keeps the bills. prefix every other key uses", () => {
    decline("last-scan", "receipt-1");
    // The app is called Billy; the storage is not, and renaming a key orphans what is already on
    // people's phones. This one is new, but it joins the same family.
    expect(Object.keys(localStorage).some((k) => k.startsWith("bills."))).toBe(true);
    expect(Object.keys(localStorage).every((k) => k.startsWith("bills."))).toBe(true);
  });
});
