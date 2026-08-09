import { describe, it, expect } from "vitest";
import { formatCents, formatCentsParts, parseToCents } from "./money";

describe("formatCents", () => {
  it("formats euros with symbol", () => {
    expect(formatCents(5430, "EUR")).toMatch(/54[.,]30/);
  });
  it("formats negative amounts", () => {
    expect(formatCents(-249, "EUR")).toMatch(/2[.,]49/);
  });
  it("does not throw on an invalid currency code", () => {
    expect(formatCents(5430, "BADCODE")).toContain("54.30");
  });
});

describe("parseToCents", () => {
  it("parses dot decimals", () => expect(parseToCents("54.30")).toBe(5430));
  it("parses comma decimals", () => expect(parseToCents("54,30")).toBe(5430));
  it("parses integers", () => expect(parseToCents("7")).toBe(700));
  it("parses negatives", () => expect(parseToCents("-0,50")).toBe(-50));
  it("parses single decimal digit", () => expect(parseToCents("2.5")).toBe(250));
  it("rejects garbage", () => expect(parseToCents("abc")).toBeNull());
  it("rejects >2 decimals", () => expect(parseToCents("1.234")).toBeNull());
  it("rejects empty", () => expect(parseToCents("")).toBeNull());
  it("rejects interior whitespace", () => expect(parseToCents("1 234,56")).toBeNull());
  it("rejects space-separated digits", () => expect(parseToCents("12 50")).toBeNull());
  it("normalizes negative zero", () => expect(parseToCents("-0")).toBe(0));
});

describe("formatCentsParts", () => {
  const joined = (cents: number, currency: string) =>
    formatCentsParts(cents, currency).map((p) => p.text).join("");

  it("rebuilds exactly what formatCents produces", () => {
    for (const [cents, cur] of [[6880, "EUR"], [0, "EUR"], [-1250, "USD"], [123456, "GBP"], [500, "JPY"]] as const) {
      expect(joined(cents, cur)).toBe(formatCents(cents, cur));
    }
  });

  it("marks the currency symbol, wherever the locale puts it", () => {
    const parts = formatCentsParts(6880, "EUR");
    const symbols = parts.filter((p) => p.currency).map((p) => p.text);
    expect(symbols.length).toBe(1);
    expect(symbols[0]).toMatch(/€|EUR/);
    // and the digits are not inside the currency part
    expect(parts.filter((p) => p.currency).some((p) => /\d/.test(p.text))).toBe(false);
  });

  it("still marks a symbol that trails the number", () => {
    const parts = formatCentsParts(6880, "SEK");
    expect(parts.some((p) => p.currency)).toBe(true);
    expect(joined(6880, "SEK")).toBe(formatCents(6880, "SEK"));
  });

  it("falls back rather than throwing on a currency code the scanner invented", () => {
    const parts = formatCentsParts(1999, "NOTACURRENCY");
    expect(parts.some((p) => p.currency)).toBe(true);
    expect(joined(1999, "NOTACURRENCY")).toContain("19.99");
  });
});
