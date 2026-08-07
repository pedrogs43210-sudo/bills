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

  it("is idempotent", () => {
    const once = migrateTrip(v1Trip);
    expect(migrateTrip(once)).toEqual(once);
  });

  it("drops unusable payment entries but keeps the receipt", () => {
    const junk = {
      ...v1Trip,
      receipts: [{
        id: "r1", storeName: "Lidl", date: "2026-07-09", printedTotal: 119, status: "review", items: [],
        payments: [null, {}, { personId: 5, amount: "x" }, { personId: "p1", amount: 119 }],
      }],
    };
    expect(migrateTrip(junk).receipts[0].payments).toEqual([{ personId: "p1", amount: 119 }]);
  });

  it("keeps a receipt whose payments are all unusable, with an empty list", () => {
    const junk = {
      ...v1Trip,
      receipts: [{ id: "r1", storeName: "Lidl", date: "2026-07-09", printedTotal: 119, status: "review", items: [], payments: [null] }],
    };
    expect(migrateTrip(junk).receipts[0].payments).toEqual([]);
  });

  it("rejects a receipt whose total is not whole cents", () => {
    const bad = { ...v1Trip, receipts: [{ ...v1Trip.receipts[0], printedTotal: 1.19 }] };
    expect(() => migrateTrip(bad)).toThrow();
  });

  it("dedupes duplicate payer rows, keeping the first entry", () => {
    const dup = {
      ...v1Trip,
      receipts: [{
        id: "r1", storeName: "Lidl", date: "2026-07-09", printedTotal: 119, status: "review", items: [],
        payments: [{ personId: "p1", amount: 60 }, { personId: "p1", amount: 59 }],
      }],
    };
    expect(migrateTrip(dup).receipts[0].payments).toEqual([{ personId: "p1", amount: 60 }]);
  });

  it("keeps the settle maths intact through migration", async () => {
    const { balances } = await import("./settle");
    const { receiptShares } = await import("./split");
    const t = migrateTrip({
      ...v1Trip,
      people: [
        { id: "p1", name: "Pedro", color: "#FFD9A0" },
        { id: "p2", name: "Ana", color: "#FFC4B8" },
      ],
      receipts: [
        { id: "r1", storeName: "Lidl", date: "2026-07-09", paidBy: "p1", printedTotal: 1000, status: "done",
          items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "everyone" } }] },
        { id: "r2", storeName: "Pingo", date: "2026-07-10", paidBy: "p2", printedTotal: 500, status: "done",
          items: [{ id: "i2", name: "juice", quantity: 2, lineTotal: 500, assignment: { kind: "units", shares: { p1: 1, p2: 1 } } }] },
      ],
    });
    for (const r of t.receipts) {
      const shares = receiptShares(r, t.people);
      expect(Object.values(shares).reduce((x, y) => x + y, 0)).toBe(r.printedTotal);
    }
    const b = balances(t);
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(0);
    expect(b).toEqual({ p1: 250, p2: -250 });
  });

  it("drops group members who aren't people in the trip", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "Breakfast", personIds: ["p1", "ghost"] }] };
    expect(migrateTrip(t).groups).toEqual([{ id: "g1", name: "Breakfast", personIds: ["p1"] }]);
  });

  it("drops a group whose personIds isn't an array", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "Breakfast", personIds: "not-an-array" }] };
    expect(migrateTrip(t).groups).toEqual([]);
  });

  it("drops a bare-string group entry instead of crashing", () => {
    const t = { ...v1Trip, groups: ["not even an object"] };
    expect(migrateTrip(t).groups).toEqual([]);
  });

  it("drops a group with a non-string name", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: 42, personIds: ["p1"] }] };
    expect(migrateTrip(t).groups).toEqual([]);
  });

  it("drops a group left with no known members", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "Ghosts", personIds: ["ghost1", "ghost2"] }] };
    expect(migrateTrip(t).groups).toEqual([]);
  });

  it("de-dupes repeated member ids within a group", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "Breakfast", personIds: ["p1", "p1"] }] };
    expect(migrateTrip(t).groups).toEqual([{ id: "g1", name: "Breakfast", personIds: ["p1"] }]);
  });

  it("renames an imported group called Everyone instead of dropping its members", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "Everyone", personIds: ["p1"] }] };
    expect(migrateTrip(t).groups).toEqual([{ id: "g1", name: "Everyone (group)", personIds: ["p1"] }]);
  });

  it("trims a padded group name", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "  Breakfast  ", personIds: ["p1"] }] };
    expect(migrateTrip(t).groups[0].name).toBe("Breakfast");
  });

  it("drops a whitespace-only group name", () => {
    const t = { ...v1Trip, groups: [{ id: "g1", name: "   ", personIds: ["p1"] }] };
    expect(migrateTrip(t).groups).toEqual([]);
  });
});
