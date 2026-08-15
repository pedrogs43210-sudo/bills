import { describe, it, expect } from "vitest";
import { splitNameFor, recentPeopleNames } from "./quickScan";
import type { Trip } from "../types";

describe("splitNameFor", () => {
  it("uses the shop's name, which is what the person will recognise", () => {
    expect(splitNameFor("Tasca do Bairro", "2026-08-14")).toBe("Tasca do Bairro");
  });

  it("falls back to the date when the scan could not read a shop name", () => {
    // Never "Untitled". A date is a fact about the receipt; "Untitled" is an apology.
    expect(splitNameFor("", "2026-08-14")).toBe("14 Aug split");
    expect(splitNameFor("   ", "2026-08-14")).toBe("14 Aug split");
  });

  it("falls back again when the date is unusable, rather than printing Invalid Date", () => {
    expect(splitNameFor("", "not-a-date")).toBe("New split");
    expect(splitNameFor("", "")).toBe("New split");
    expect(splitNameFor("", null)).toBe("New split");
  });

  it("handles a null date, which is possible from the scan result schema", () => {
    expect(splitNameFor("", null)).toBe("New split");
  });

  it("trims and shortens a name too long to read in a list row", () => {
    // Exactly 41 characters: should truncate to 39 + ellipsis = 40 total.
    const exactly41 = "A".repeat(41);
    const truncated = splitNameFor(exactly41, "2026-08-14");
    expect(truncated).toBe("A".repeat(39) + "…");
    expect(truncated.length).toBe(40);

    // Exactly 40 characters: should pass through untouched.
    const exactly40 = "A".repeat(40);
    expect(splitNameFor(exactly40, "2026-08-14")).toBe(exactly40);
    expect(splitNameFor(exactly40, "2026-08-14").length).toBe(40);

    // Trimming trailing space: if the truncation point lands on a space, trimEnd() removes it.
    // Input: 38 A's + space (at position 39) + more chars to exceed 40. After truncating to 39
    // and trimming, we get 38 A's + ellipsis = 39 total.
    const spaceAtTruncation = "A".repeat(38) + " " + "B".repeat(3);
    expect(splitNameFor(spaceAtTruncation, "2026-08-14")).toBe("A".repeat(38) + "…");

    expect(splitNameFor(`  Pingo Doce  `, "2026-08-14")).toBe("Pingo Doce");
  });

  it("handles emoji without cutting them in half, counting by code point not UTF-16 unit", () => {
    // 39 A's + emoji + 10 B's = 50 code points, should truncate to 39 + ellipsis = 40 total.
    // The emoji is a single code point, so if we slice at 39, we get all 39 A's, no emoji.
    const withEmoji = "A".repeat(39) + "🧾" + "B".repeat(10);
    const result = splitNameFor(withEmoji, "2026-08-14");
    expect(result.length).toBe(40);
    // Verify it ends with the ellipsis, not a lone surrogate rendering as an error symbol.
    expect(result).toBe("A".repeat(39) + "…");
  });

  it("names receipts with specific month abbreviations, stable across all devices", () => {
    // September was "Sep" on CLDR 42+, "Sept" on older versions. We use a constant array.
    expect(splitNameFor("", "2026-09-05")).toBe("5 Sep split");
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

  it("skips a You-only split to reach earlier friends, so quick-scanning without adding people does not erase the previous month", () => {
    // Concrete case: A (oldest, friends), B (recent, You-only), current C (You-only) should suggest A.
    const trips = [
      trip("A", "2026-08-01T10:00:00Z", ["You", "Maria", "Ana"]),
      trip("B", "2026-08-10T10:00:00Z", ["You"]),
      trip("C", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "C")).toEqual(["Maria", "Ana"]);
  });

  it("deduplicates names on the same normalised key, keeping the first spelling", () => {
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", ["Ana", "ana", " ANA ", "Rui"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Ana", "Rui"]);
  });

  it("uses the stored array order, not the createdAt order, when timestamps tie", () => {
    // Tests the tiebreak logic. If A and B have identical createdAt, the one last in the input
    // array (higher index) should be picked because it appears later in the "most recent" sort.
    const trips = [
      trip("A", "2026-08-12T10:00:00Z", ["Ana"]),
      trip("B", "2026-08-12T10:00:00Z", ["Maria"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    // B has index 1, A has index 0, so B should be picked even though they tie on createdAt.
    expect(recentPeopleNames(trips, "current")).toEqual(["Maria"]);
  });

  it("does not reorder the input array", () => {
    // Deliberately shuffle the array so the most recent by date is not last.
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", ["Maria"]),
      trip("old", "2026-08-01T10:00:00Z", ["Ana"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    const original = trips.map((t) => t.id);
    recentPeopleNames(trips, "current");
    expect(trips.map((t) => t.id)).toEqual(original);
  });
});
