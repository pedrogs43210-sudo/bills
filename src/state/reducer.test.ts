import { describe, it, expect } from "vitest";
import { reducer, personHasEntries, type Action } from "./reducer";
import { emptyData, type AppData } from "../lib/storage";
import type { Receipt, Trip } from "../types";

function run(actions: Action[], start: AppData = emptyData()): AppData {
  return actions.reduce(reducer, start);
}

const baseReceipt: Receipt = {
  id: "r1", storeName: "Lidl", date: "2026-07-08",
  payments: [{ personId: "p1", amount: 450 }],
  items: [{ id: "i1", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } }],
  printedTotal: 450, status: "review",
};

describe("trips and people", () => {
  it("creates a trip with defaults", () => {
    const data = run([{ type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" }]);
    expect(data.trips).toHaveLength(1);
    expect(data.trips[0]).toMatchObject({ id: "t1", name: "Algarve", currency: "EUR", people: [], receipts: [] });
  });

  it("adds people with distinct cycling colors", () => {
    const data = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "addPerson", tripId: "t1", personId: "p2", name: "Ana" },
    ]);
    const [a, b] = data.trips[0].people;
    expect(a.name).toBe("Pedro");
    expect(a.color).not.toBe(b.color);
  });

  it("removes a person with no entries, blocks one with entries", () => {
    const start = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "addPerson", tripId: "t1", personId: "p2", name: "Ana" },
      { type: "addReceipt", tripId: "t1", receipt: baseReceipt }, // paidBy p1
    ]);
    const afterBlocked = reducer(start, { type: "removePerson", tripId: "t1", personId: "p1" });
    expect(afterBlocked.trips[0].people).toHaveLength(2); // unchanged — p1 paid a receipt
    const afterOk = reducer(start, { type: "removePerson", tripId: "t1", personId: "p2" });
    expect(afterOk.trips[0].people.map((p) => p.id)).toEqual(["p1"]);
  });

  it("deletes a trip", () => {
    const data = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "deleteTrip", tripId: "t1" },
    ]);
    expect(data.trips).toHaveLength(0);
  });

  it("does not reuse a color after removing and re-adding people", () => {
    const start = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "addPerson", tripId: "t1", personId: "p2", name: "Ana" },
      { type: "addPerson", tripId: "t1", personId: "p3", name: "Bruno" },
    ]);
    const removed = reducer(start, { type: "removePerson", tripId: "t1", personId: "p1" });
    const after = reducer(removed, { type: "addPerson", tripId: "t1", personId: "p4", name: "Carla" });
    const colors = after.trips[0].people.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length); // all distinct
  });

  it("renames a person", () => {
    const data = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "renamePerson", tripId: "t1", personId: "p1", name: "Pedrinho" },
    ]);
    expect(data.trips[0].people[0].name).toBe("Pedrinho");
  });
});

describe("receipts and assignments", () => {
  const start = run([
    { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
    { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
    { type: "addReceipt", tripId: "t1", receipt: baseReceipt },
  ]);

  it("adds and replaces receipts", () => {
    const edited = { ...baseReceipt, storeName: "Continente" };
    const data = reducer(start, { type: "updateReceipt", tripId: "t1", receipt: edited });
    expect(data.trips[0].receipts[0].storeName).toBe("Continente");
  });

  it("sets an item assignment", () => {
    const data = reducer(start, {
      type: "setAssignment", tripId: "t1", receiptId: "r1", itemId: "i1",
      assignment: { kind: "everyone" },
    });
    expect(data.trips[0].receipts[0].items[0].assignment).toEqual({ kind: "everyone" });
  });

  it("sets receipt status and trip currency", () => {
    let data = reducer(start, { type: "setReceiptStatus", tripId: "t1", receiptId: "r1", status: "done" });
    data = reducer(data, { type: "setCurrency", tripId: "t1", currency: "GBP" });
    expect(data.trips[0].receipts[0].status).toBe("done");
    expect(data.trips[0].currency).toBe("GBP");
  });

  it("deletes a receipt", () => {
    const data = reducer(start, { type: "deleteReceipt", tripId: "t1", receiptId: "r1" });
    expect(data.trips[0].receipts).toHaveLength(0);
  });
});

describe("personHasEntries", () => {
  const trip: Trip = {
    id: "t1", name: "A", emoji: "x", currency: "EUR",
    people: [{ id: "p1", name: "Pedro", color: "#fff" }, { id: "p2", name: "Ana", color: "#eee" }],
    groups: [],
    receipts: [{
      ...baseReceipt,
      items: [{ id: "i1", name: "Juice", quantity: 1, lineTotal: 100, assignment: { kind: "people", personIds: ["p2"] } }],
    }],
    createdAt: "", schemaVersion: 1,
  };
  it("true for payer and for assigned person", () => {
    expect(personHasEntries(trip, "p1")).toBe(true); // paid
    expect(personHasEntries(trip, "p2")).toBe(true); // assigned
  });
  it("true for everyone-assignments", () => {
    const t = { ...trip, receipts: [{ ...trip.receipts[0], payments: [{ personId: "p2", amount: 100 }], items: [{ id: "i1", name: "x", quantity: 1, lineTotal: 100, assignment: { kind: "everyone" as const } }] }] };
    expect(personHasEntries(t, "p1")).toBe(true);
  });
});

describe("importTrip action", () => {
  it("appends a new trip and replaces an existing one by id", () => {
    const t1: Trip = { id: "t1", name: "Old", emoji: "x", currency: "EUR", people: [], groups: [], receipts: [], createdAt: "", schemaVersion: 1 };
    let data = run([], { schemaVersion: 1, trips: [t1] });
    data = reducer(data, { type: "importTrip", trip: { ...t1, name: "New" } });
    expect(data.trips).toHaveLength(1);
    expect(data.trips[0].name).toBe("New");
    data = reducer(data, { type: "importTrip", trip: { ...t1, id: "t2", name: "Other" } });
    expect(data.trips).toHaveLength(2);
  });
});
