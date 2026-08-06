import { describe, it, expect } from "vitest";
import { migrateTrip } from "./migrate";

const v1Trip = {
  id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
  people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
  receipts: [
    {
      id: "r1", storeName: "Lidl", date: "2026-07-09", paidBy: "p1",
      items: [{ id: "i1", name: "Pão", quantity: 1, lineTotal: 119, assignment: { kind: "unassigned" } }],
      printedTotal: 119, status: "review",
    },
  ],
  createdAt: "2026-07-09T00:00:00Z", schemaVersion: 1,
};

describe("migrateTrip", () => {
  it("turns a v1 payer into a single payment for the whole total", () => {
    const t = migrateTrip(v1Trip);
    expect(t.receipts[0].payments).toEqual([{ personId: "p1", amount: 119 }]);
    expect(t.schemaVersion).toBe(2);
  });

  it("drops the old paidBy field", () => {
    const t = migrateTrip(v1Trip);
    expect("paidBy" in t.receipts[0]).toBe(false);
  });

  it("adds an empty groups list", () => {
    expect(migrateTrip(v1Trip).groups).toEqual([]);
  });

  it("keeps every other field untouched", () => {
    const t = migrateTrip(v1Trip);
    expect(t.name).toBe("Algarve");
    expect(t.currency).toBe("EUR");
    expect(t.receipts[0].items[0].name).toBe("Pão");
    expect(t.receipts[0].status).toBe("review");
  });

  it("migrates several receipts", () => {
    const two = {
      ...v1Trip,
      receipts: [v1Trip.receipts[0], { ...v1Trip.receipts[0], id: "r2", paidBy: "p1", printedTotal: 500 }],
    };
    const t = migrateTrip(two);
    expect(t.receipts.map((r) => r.payments[0].amount)).toEqual([119, 500]);
  });

  it("leaves an already-v2 trip alone", () => {
    const v2 = {
      ...v1Trip,
      groups: [{ id: "g1", name: "Breakfast", personIds: ["p1"] }],
      receipts: [
        {
          ...v1Trip.receipts[0],
          paidBy: undefined,
          payments: [{ personId: "p1", amount: 60 }, { personId: "p2", amount: 59 }],
        },
      ],
      schemaVersion: 2,
    };
    const t = migrateTrip(v2);
    expect(t.receipts[0].payments).toHaveLength(2);
    expect(t.groups[0].name).toBe("Breakfast");
  });

  it("rejects things that are not trips", () => {
    expect(() => migrateTrip(null)).toThrow();
    expect(() => migrateTrip({ hello: "world" })).toThrow();
    expect(() => migrateTrip({ ...v1Trip, people: "nope" })).toThrow();
  });

  it("rejects a receipt with neither payments nor paidBy", () => {
    const broken = { ...v1Trip, receipts: [{ id: "r9", printedTotal: 100 }] };
    expect(() => migrateTrip(broken)).toThrow();
  });
});
