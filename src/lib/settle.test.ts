import { describe, it, expect } from "vitest";
import { balances, settle, paidTotals, shareTotals } from "./settle";
import type { Person, Receipt, Trip } from "../types";

const people: Person[] = [
  { id: "pedro", name: "Pedro", color: "#FFD9A0" },
  { id: "ana", name: "Ana", color: "#FFC4B8" },
  { id: "bruno", name: "Bruno", color: "#C9E8C9" },
];

function trip(receipts: Receipt[]): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people, receipts, createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

function everyoneReceipt(total: number, paidBy: string): Receipt {
  return {
    id: `r-${paidBy}-${total}`, storeName: "Lidl", date: "2026-07-08", paidBy,
    items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: total, assignment: { kind: "everyone" } }],
    printedTotal: total, status: "done",
  };
}

describe("balances", () => {
  it("is paid minus share, summing to zero", () => {
    const t = trip([everyoneReceipt(300, "pedro")]);
    const b = balances(t);
    expect(b).toEqual({ pedro: 200, ana: -100, bruno: -100 });
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("nets multiple receipts with different payers", () => {
    const t = trip([everyoneReceipt(300, "pedro"), everyoneReceipt(300, "ana")]);
    expect(balances(t)).toEqual({ pedro: 100, ana: 100, bruno: -200 });
  });

  it("exposes paid and share totals for the settle screen", () => {
    const t = trip([everyoneReceipt(300, "pedro")]);
    expect(paidTotals(t)).toEqual({ pedro: 300, ana: 0, bruno: 0 });
    expect(shareTotals(t)).toEqual({ pedro: 100, ana: 100, bruno: 100 });
  });

  it("stays zero-sum even when a receipt contains a non-member assignment id", () => {
    const ghostReceipt: Receipt = {
      id: "rg", storeName: "Lidl", date: "2026-07-08", paidBy: "pedro",
      items: [{ id: "i1", name: "stuff", quantity: 2, lineTotal: 300, assignment: { kind: "units", shares: { ghost: 1, ana: 1 } } }],
      printedTotal: 300, status: "done",
    };
    const b = balances(trip([ghostReceipt]));
    expect(Object.keys(b).sort()).toEqual(["ana", "bruno", "pedro"]);
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(0);
  });
});

describe("settle", () => {
  it("returns no transfers when everyone is even", () => {
    expect(settle({ pedro: 0, ana: 0 })).toEqual([]);
  });

  it("settles a single debt", () => {
    expect(settle({ pedro: 200, ana: -200 })).toEqual([{ from: "ana", to: "pedro", amount: 200 }]);
  });

  it("settles multiple debtors to one creditor", () => {
    expect(settle({ pedro: 200, ana: -100, bruno: -100 })).toEqual([
      { from: "ana", to: "pedro", amount: 100 },
      { from: "bruno", to: "pedro", amount: 100 },
    ]);
  });

  it("zeroes out any balance set (random)", () => {
    for (let run = 0; run < 100; run++) {
      const b: Record<string, number> = {};
      let sum = 0;
      for (const id of ["a", "b", "c", "d"]) {
        const v = Math.floor(Math.random() * 4000) - 2000;
        b[id] = v;
        sum += v;
      }
      b["e"] = -sum; // force zero-sum
      const transfers = settle(b);
      const after = { ...b };
      for (const t of transfers) {
        after[t.from] += t.amount;
        after[t.to] -= t.amount;
        expect(t.amount).toBeGreaterThan(0);
      }
      for (const v of Object.values(after)) expect(v).toBe(0);
      // never more transfers than people-1
      expect(transfers.length).toBeLessThanOrEqual(4);
    }
  });
});
