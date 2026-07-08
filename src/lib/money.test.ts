import { describe, it, expect } from "vitest";
import { formatCents, parseToCents } from "./money";

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
