import { describe, it, expect } from "vitest";
import { splitNameFor } from "./quickScan";

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
