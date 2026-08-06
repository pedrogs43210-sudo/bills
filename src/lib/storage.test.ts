import { describe, it, expect, beforeEach } from "vitest";
import { loadData, saveData, emptyData, exportTrip, importTrip, loadApiKey, saveApiKey } from "./storage";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
  people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
  groups: [],
  receipts: [], createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
};

beforeEach(() => localStorage.clear());

describe("loadData / saveData", () => {
  it("returns empty data when nothing stored", () => {
    expect(loadData()).toEqual(emptyData());
  });

  it("round-trips data", () => {
    saveData({ schemaVersion: 1, trips: [trip] });
    expect(loadData().trips[0].name).toBe("Algarve");
  });

  it("never crashes on corrupt JSON — backs it up and starts empty", () => {
    localStorage.setItem("bills.data.v1", "{not json!!");
    expect(loadData()).toEqual(emptyData());
    expect(localStorage.getItem("bills.data.v1.corrupt")).toBe("{not json!!");
  });

  it("treats wrong-shaped JSON as corrupt", () => {
    localStorage.setItem("bills.data.v1", JSON.stringify({ hello: "world" }));
    expect(loadData()).toEqual(emptyData());
  });

  it("treats data without schemaVersion as corrupt", () => {
    localStorage.setItem("bills.data.v1", JSON.stringify({ trips: [] }));
    expect(loadData()).toEqual(emptyData());
  });
});

describe("saveData quota guard", () => {
  it("returns false instead of throwing when storage is full", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      expect(saveData({ schemaVersion: 1, trips: [] })).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
  it("returns true on success", () => {
    expect(saveData({ schemaVersion: 1, trips: [] })).toBe(true);
  });
});

describe("api key", () => {
  it("round-trips the key", () => {
    saveApiKey("sk-ant-test");
    expect(loadApiKey()).toBe("sk-ant-test");
  });
  it("defaults to empty string", () => {
    expect(loadApiKey()).toBe("");
  });
});

describe("export / import", () => {
  it("round-trips a trip", () => {
    const json = exportTrip(trip);
    expect(importTrip(json).name).toBe("Algarve");
  });
  it("rejects non-trip JSON", () => {
    expect(() => importTrip(JSON.stringify({ foo: 1 }))).toThrow();
  });
  it("rejects invalid JSON", () => {
    expect(() => importTrip("nope")).toThrow();
  });
  it("rejects a trip without an id", () => {
    expect(() => importTrip(JSON.stringify({ app: "bills", trip: { name: "x", people: [], receipts: [] } }))).toThrow();
  });
  it("round-trips emoji and accents", () => {
    const t = { ...trip, name: "Férias 👨‍👩‍👧‍👦 🇵🇹" };
    expect(importTrip(exportTrip(t)).name).toBe("Férias 👨‍👩‍👧‍👦 🇵🇹");
  });
});

describe("migration on load", () => {
  it("upgrades v1 data and writes it back once", () => {
    const v1 = {
      schemaVersion: 1,
      trips: [{
        id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
        people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
        receipts: [{
          id: "r1", storeName: "Lidl", date: "2026-07-09", paidBy: "p1",
          items: [], printedTotal: 500, status: "done",
        }],
        createdAt: "2026-07-09T00:00:00Z", schemaVersion: 1,
      }],
    };
    localStorage.setItem("bills.data.v1", JSON.stringify(v1));
    const loaded = loadData();
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.trips[0].receipts[0].payments).toEqual([{ personId: "p1", amount: 500 }]);
    expect(loaded.trips[0].groups).toEqual([]);
    // written back, so the next load needs no conversion
    const onDisk = JSON.parse(localStorage.getItem("bills.data.v1")!);
    expect(onDisk.schemaVersion).toBe(2);
  });

  it("treats data from a newer version as corrupt", () => {
    const future = JSON.stringify({ schemaVersion: 99, trips: [] });
    localStorage.setItem("bills.data.v1", future);
    expect(loadData()).toEqual(emptyData());
    expect(localStorage.getItem("bills.data.v1.corrupt")).toBe(future);
  });

  it("imports a v1 export file", () => {
    const file = JSON.stringify({
      app: "bills", schemaVersion: 1,
      trip: {
        id: "t9", name: "Madeira", emoji: "⛰️", currency: "EUR",
        people: [{ id: "p1", name: "Ana", color: "#FFC4B8" }],
        receipts: [{ id: "r1", storeName: "Pingo", date: "2026-07-01", paidBy: "p1", items: [], printedTotal: 250, status: "done" }],
        createdAt: "2026-07-01T00:00:00Z", schemaVersion: 1,
      },
    });
    const trip = importTrip(file);
    expect(trip.receipts[0].payments).toEqual([{ personId: "p1", amount: 250 }]);
    expect(trip.groups).toEqual([]);
  });

  it("keeps the good trips when one is unreadable", () => {
    const good = {
      id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
      people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
      receipts: [{ id: "r1", storeName: "Lidl", date: "2026-07-09", paidBy: "p1", items: [], printedTotal: 500, status: "done" }],
      createdAt: "2026-07-09T00:00:00Z", schemaVersion: 1,
    };
    const bad = { ...good, id: "t2", name: "Broken", receipts: [null] };
    localStorage.setItem("bills.data.v1", JSON.stringify({ schemaVersion: 1, trips: [good, bad] }));
    const loaded = loadData();
    expect(loaded.trips.map((t) => t.name)).toEqual(["Algarve"]);
    expect(localStorage.getItem("bills.data.v1.rejected")).toContain("Broken");
  });

  it("backs up the pre-migration blob once", () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      trips: [{
        id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
        people: [], receipts: [], createdAt: "2026-07-09T00:00:00Z", schemaVersion: 1,
      }],
    });
    localStorage.setItem("bills.data.v1", v1);
    loadData();
    expect(localStorage.getItem("bills.data.v1.pre-v2")).toBe(v1);
  });

  it("rejects an export from a newer version", () => {
    const future = JSON.stringify({ app: "bills", schemaVersion: 99, trip: { id: "t1", name: "Future", people: [], receipts: [] } });
    expect(() => importTrip(future)).toThrow(/newer version/i);
  });

  it("rejects an export whose trip claims a newer version", () => {
    const future = JSON.stringify({ app: "bills", trip: { id: "t1", name: "Future", people: [], receipts: [], schemaVersion: 99 } });
    expect(() => importTrip(future)).toThrow(/newer version/i);
  });
});
