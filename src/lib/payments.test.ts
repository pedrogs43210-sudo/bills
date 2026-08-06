import { describe, it, expect } from "vitest";
import { paymentsTotal, primaryPayerId, splitEvenly, withSyncedSinglePayment } from "./payments";
import type { Payment, Receipt } from "../types";

function receipt(payments: Payment[], printedTotal = 1000): Receipt {
  return {
    id: "r1", storeName: "Lidl", date: "2026-08-06",
    payments, items: [], printedTotal, status: "review",
  };
}

describe("paymentsTotal", () => {
  it("sums the amounts", () => {
    expect(paymentsTotal(receipt([{ personId: "a", amount: 600 }, { personId: "b", amount: 400 }]))).toBe(1000);
  });
  it("is zero with no payments", () => expect(paymentsTotal(receipt([]))).toBe(0));
});

describe("primaryPayerId", () => {
  it("picks the largest payment", () => {
    expect(primaryPayerId(receipt([{ personId: "a", amount: 400 }, { personId: "b", amount: 600 }]))).toBe("b");
  });
  it("breaks ties by lowest id", () => {
    expect(primaryPayerId(receipt([{ personId: "b", amount: 500 }, { personId: "a", amount: 500 }]))).toBe("a");
  });
  it("is null when nobody paid", () => expect(primaryPayerId(receipt([]))).toBeNull());
});

describe("withSyncedSinglePayment", () => {
  it("syncs a lone payer to the printed total", () => {
    const r = withSyncedSinglePayment(receipt([{ personId: "a", amount: 0 }], 1234));
    expect(r.payments).toEqual([{ personId: "a", amount: 1234 }]);
  });
  it("leaves several payers alone", () => {
    const payments = [{ personId: "a", amount: 600 }, { personId: "b", amount: 100 }];
    expect(withSyncedSinglePayment(receipt(payments, 1000)).payments).toEqual(payments);
  });
  it("returns the same object when already in sync", () => {
    const r = receipt([{ personId: "a", amount: 1000 }], 1000);
    expect(withSyncedSinglePayment(r)).toBe(r);
  });
});

describe("splitEvenly", () => {
  it("splits evenly when it divides", () => {
    expect(splitEvenly(1000, ["a", "b"])).toEqual([
      { personId: "a", amount: 500 },
      { personId: "b", amount: 500 },
    ]);
  });
  it("gives leftover cents to the earliest payers", () => {
    expect(splitEvenly(1000, ["a", "b", "c"])).toEqual([
      { personId: "a", amount: 334 },
      { personId: "b", amount: 333 },
      { personId: "c", amount: 333 },
    ]);
  });
  it("ignores duplicate ids", () => {
    expect(splitEvenly(1000, ["a", "a", "b"])).toEqual([
      { personId: "a", amount: 500 },
      { personId: "b", amount: 500 },
    ]);
  });
  it("returns nothing for nobody", () => expect(splitEvenly(1000, [])).toEqual([]));
  it("always sums exactly to the total (random)", () => {
    for (let run = 0; run < 300; run++) {
      const total = Math.floor(Math.random() * 20000) + 1;
      const count = 1 + Math.floor(Math.random() * 6);
      const ids = Array.from({ length: count }, (_, i) => `p${i}`);
      const sum = splitEvenly(total, ids).reduce((s, p) => s + p.amount, 0);
      expect(sum).toBe(total);
    }
  });
  it("sums exactly for zero and negative totals", () => {
    expect(splitEvenly(0, ["a", "b"]).reduce((s, p) => s + p.amount, 0)).toBe(0);
    expect(splitEvenly(-1000, ["a", "b", "c"]).reduce((s, p) => s + p.amount, 0)).toBe(-1000);
  });
  it("does not depend on payer order for the primary payer", () => {
    const forward = { id: "r", storeName: "", date: "", payments: [{ personId: "a", amount: 300 }, { personId: "b", amount: 700 }], items: [], printedTotal: 1000, status: "review" as const };
    const reversed = { ...forward, payments: [...forward.payments].reverse() };
    expect(primaryPayerId(forward)).toBe(primaryPayerId(reversed));
  });
});
