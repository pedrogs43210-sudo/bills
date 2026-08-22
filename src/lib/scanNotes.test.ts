import { describe, it, expect } from "vitest";
import { scanNotes, type ScanResult } from "./receipt";

function result(over: Partial<ScanResult> = {}): ScanResult {
  return {
    readQuality: "good",
    readProblem: null,
    storeName: "Bar Lola",
    date: "2026-08-20",
    currency: "EUR",
    items: [],
    paidTotal: 1000,
    preDiscountTotal: null,
    ...over,
  };
}

describe("what a scan hands on to the receipt", () => {
  it("says nothing at all about a clean scan in the split's own currency", () => {
    // Silence is the point. A warning that appears on every receipt is one nobody reads by the
    // third time, and this one has to still work the day it matters.
    expect(scanNotes(result(), "EUR")).toEqual({});
  });

  it("records a partial read, with the model's own words", () => {
    const notes = scanNotes(
      result({ readQuality: "partial", readProblem: "the bottom of the receipt is cut off" }),
      "EUR"
    );
    expect(notes.readQuality).toBe("partial");
    expect(notes.readProblem).toBe("the bottom of the receipt is cut off");
  });

  it("keeps the flag even when the model gave no explanation", () => {
    const notes = scanNotes(result({ readQuality: "partial", readProblem: null }), "EUR");
    expect(notes.readQuality).toBe("partial");
    expect(notes.readProblem).toBeUndefined();
  });

  it("flags a currency that disagrees with the split", () => {
    expect(scanNotes(result({ currency: "GBP" }), "EUR").scannedCurrency).toBe("GBP");
  });

  it("stays quiet when they agree, whatever the casing", () => {
    expect(scanNotes(result({ currency: "eur" }), "EUR").scannedCurrency).toBeUndefined();
    expect(scanNotes(result({ currency: "EUR" }), "eur").scannedCurrency).toBeUndefined();
  });

  it("stays quiet when the receipt printed no currency at all", () => {
    // Null is the honest answer the prompt asks for when nothing is shown. It is not a
    // disagreement, and offering to switch a split to "" would be worse than saying nothing.
    expect(scanNotes(result({ currency: null }), "EUR").scannedCurrency).toBeUndefined();
    expect(scanNotes(result({ currency: "  " }), "EUR").scannedCurrency).toBeUndefined();
  });

  it("never reports 'unreadable' onto a receipt", () => {
    // An unreadable photo is refunded and sent back for another try — it never becomes a receipt,
    // so nothing downstream should have to handle the case.
    const notes = scanNotes(result({ readQuality: "unreadable", readProblem: "too blurred" }), "EUR");
    expect(notes.readQuality).toBeUndefined();
  });
});
