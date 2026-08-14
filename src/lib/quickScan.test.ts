import { describe, it, expect } from "vitest";
import { splitNameFor, recentPeopleNames } from "./quickScan";
import type { Trip } from "../types";

describe("splitNameFor", () => {
  it("uses the shop's name, which is what the person will recognise", () => {
    expect(splitNameFor("Tasca do Bairro", "2026-08-14")).toBe("Tasca do Bairro");
  });

  it("falls back to the date when the scan could not read a shop name", () => {
    // Never "Untitled". A date is a fact about the receipt; "Untitled" is an apology.
    expect(splitNameFor(null, "2026-08-14")).toBe("14 Aug split");
    expect(splitNameFor("", "2026-08-14")).toBe("14 Aug split");
    expect(splitNameFor("   ", "2026-08-14")).toBe("14 Aug split");
  });

  it("falls back again when the date is unusable, rather than printing Invalid Date", () => {
    expect(splitNameFor(null, "not-a-date")).toBe("New split");
    expect(splitNameFor(null, "")).toBe("New split");
  });

  it("trims and shortens a name too long to read in a list row", () => {
    const long = "Supermercado Continente Modelo Hipermercados Amoreiras Lisboa";
    expect(splitNameFor(long, "2026-08-14").length).toBeLessThanOrEqual(40);
    expect(splitNameFor(`  Pingo Doce  `, "2026-08-14")).toBe("Pingo Doce");
  });
});

const trip = (id: string, createdAt: string, names: string[]): Trip => ({
  id,
  name: id,
  emoji: "🧾",
  currency: "EUR",
  people: names.map((n, i) => ({ id: `${id}-${i}`, name: n, color: "#fff" })),
  groups: [],
  receipts: [],
  createdAt,
  schemaVersion: 2,
});

describe("recentPeopleNames", () => {
  it("offers the people from the most recent other split", () => {
    const trips = [
      trip("old", "2026-08-01T10:00:00Z", ["Ana", "Rui"]),
      trip("recent", "2026-08-12T10:00:00Z", ["Maria", "João"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Maria", "João"]);
  });

  it("never suggests somebody already here — including the You it just created", () => {
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", ["You", "Maria"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Maria"]);
  });

  it("ignores case and padding when deciding somebody is already here", () => {
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", [" maria ", "Rui"]),
      trip("current", "2026-08-14T10:00:00Z", ["Maria"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Rui"]);
  });

  it("says nothing when there is no previous split, rather than an empty row of chips", () => {
    expect(recentPeopleNames([trip("current", "2026-08-14T10:00:00Z", ["You"])], "current")).toEqual([]);
    expect(recentPeopleNames([], "current")).toEqual([]);
  });

  it("skips a previous split that had nobody in it", () => {
    const trips = [
      trip("has-people", "2026-08-10T10:00:00Z", ["Ana"]),
      trip("empty", "2026-08-12T10:00:00Z", []),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Ana"]);
  });
});
