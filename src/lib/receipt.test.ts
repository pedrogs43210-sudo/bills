import { describe, it, expect } from "vitest";
import { PROMPT, SCAN_IMAGE_MAX_EDGE, SCAN_MODEL } from "./receipt";

/**
 * The prompt is the app's most fragile asset and the least visible: nothing type-checks it, and
 * the only symptom of a bad edit is wrong money on someone's phone.
 *
 * These pin the two failures seen on real receipts. Haiku read a Portuguese shop and returned the
 * total as a line item several times over, which multiplied the bill — because an earlier edit of
 * mine said "return every printed line as an entry" and never said totals were not items.
 */
describe("the scanning prompt", () => {
  it("forbids putting a total in the items list, and names the wordings", () => {
    // Matches the intent, not one phrasing: the rule has already been broadened once, from
    // "a total" to totals, subtotals, tax and change lines.
    expect(PROMPT).toMatch(/NEVER put a total[^.]*in "items"/);
    for (const label of ["TOTAL A PAGAR", "VALOR A PAGAR", "SUBTOTAL", "TROCO", "IVA"]) {
      expect(PROMPT, `must name ${label}`).toContain(label);
    }
    // and the examples must span languages, or the model treats one country's words as the rule
    for (const label of ["TOTALE", "SUMME", "EFECTIVO", "合計"]) {
      expect(PROMPT, `must name ${label}`).toContain(label);
    }
    expect(PROMPT).toMatch(/non-exhaustive/i);
  });

  it("does not ask for every printed line — that is what produced the duplicated totals", () => {
    expect(PROMPT).not.toMatch(/every printed line/i);
  });

  it("tells the model to leave a doubtful line out rather than guess it into the maths", () => {
    expect(PROMPT).toMatch(/leave it out/i);
  });

  it("says a comma decimal and a euro sign both mean EUR", () => {
    expect(PROMPT).toContain("EUR");
    expect(PROMPT).toMatch(/1,19/);
  });

  it("asks for the amount paid rather than whichever total is printed first", () => {
    expect(PROMPT).toMatch(/ACTUALLY PAID/);
    expect(PROMPT).toMatch(/never the pre-discount one/i);
  });
});

describe("the scanning model and image size", () => {
  it("uses a model with high-resolution vision, because receipts are small print", () => {
    // Haiku 4.5 caps at 1568px and misread most real receipts; Sonnet 5 and Opus 4.8 reach 2576.
    expect(["claude-sonnet-5", "claude-opus-4-8", "claude-opus-5"]).toContain(SCAN_MODEL);
  });

  it("sends images at the model's own ceiling, not the older 1568px one", () => {
    expect(SCAN_IMAGE_MAX_EDGE).toBe(2576);
  });
});

describe("reading a receipt in any language", () => {
  it("says the receipt may be in any language, and that the word lists are examples", () => {
    expect(PROMPT).toMatch(/may be in ANY language/i);
    expect(PROMPT).toMatch(/EXAMPLES, never the whole set/i);
    expect(PROMPT).toMatch(/what it MEANS and WHERE it sits/i);
  });

  it("keeps item names in their original language rather than translating them", () => {
    // the person reading the list has to recognise it against the paper in their hand
    expect(PROMPT).toMatch(/ORIGINAL language and script/);
    expect(PROMPT).toMatch(/Do not translate/i);
  });

  it("handles both decimal conventions and a currency with no minor unit", () => {
    expect(PROMPT).toMatch(/1\.234,56/);
    expect(PROMPT).toMatch(/1,234\.56/);
    expect(PROMPT).toMatch(/JPY/);
  });

  it("gives discount examples in more than one language", () => {
    for (const word of ["DESCONTO", "DESCUENTO", "SCONTO", "REMISE", "RABATT", "DISCOUNT"]) {
      expect(PROMPT, `must name ${word}`).toContain(word);
    }
  });

  it("returns null rather than guessing when no currency is printed", () => {
    expect(PROMPT).toMatch(/use null rather than guessing/i);
  });
});
