import { describe, it, expect } from "vitest";
import { readPublish, readClaims, MAX_PAYLOAD_BYTES } from "./shared";

const split = { name: "Tasca", emoji: "🧾", currency: "EUR", people: [], receipts: [] };

describe("a publish request", () => {
  it("accepts a split", () => {
    const out = readPublish({ split });
    expect(out.ok).toBe(true);
    if (out.ok) expect(JSON.parse(out.payload)).toEqual(split);
  });

  it("refuses one too big to be a dinner", () => {
    // A cap, because the only real abuse here is filling the database. A receipt with four hundred
    // items is still comfortably inside this.
    const huge = { split: { ...split, receipts: [{ blob: "x".repeat(MAX_PAYLOAD_BYTES) }] } };
    expect(readPublish(huge).ok).toBe(false);
  });

  it("measures the cap in bytes, not characters", () => {
    // An emoji is one character and four bytes, and it is the bytes that get stored.
    const emoji = { split: { ...split, name: "🧾".repeat(MAX_PAYLOAD_BYTES / 3) } };
    expect(readPublish(emoji).ok).toBe(false);
  });

  it("refuses rubbish without throwing", () => {
    for (const bad of [null, undefined, "", 7, [], {}, { split: null }, { split: "hello" }, { split: [] }]) {
      expect(readPublish(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("a claims request", () => {
  it("takes a list of item ids", () => {
    expect(readClaims({ itemIds: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("takes an empty list, because unticking everything is a real answer", () => {
    // Not the same as never having answered — this is somebody saying "none of it was mine".
    expect(readClaims({ itemIds: [] })).toEqual([]);
  });

  it("drops anything that is not a string id, rather than refusing the whole request", () => {
    expect(readClaims({ itemIds: ["a", 7, null, "", "b"] })).toEqual(["a", "b"]);
  });

  it("caps the number of items, so one request cannot be a denial of service", () => {
    const many = readClaims({ itemIds: Array.from({ length: 5000 }, (_, i) => `i${i}`) });
    expect(many!.length).toBeLessThanOrEqual(1000);
  });

  it("returns null for anything that is not a claims body", () => {
    for (const bad of [null, undefined, {}, { itemIds: "a" }, 7, { itemIds: null }]) {
      expect(readClaims(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
