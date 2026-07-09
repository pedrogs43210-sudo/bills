import { describe, it, expect, beforeEach } from "vitest";
import { loadData, saveData, emptyData, exportTrip, importTrip, loadApiKey, saveApiKey } from "./storage";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
  people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
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
});
