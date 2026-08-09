import { describe, it, expect } from "vitest";
import { applyConvention, conventionSentence, countsDiscountLines, discountConvention, type ReceiptTotals } from "./discounts";
import type { Item } from "../types";

/** Pingo Doce: items at full price, discount on its own line, two printed totals. */
const pingoDoce: ReceiptTotals = { itemsTotal: 699, discountsTotal: -50, paidTotal: 649 };
/** Continente: item price already reduced, bracket is information only. */
const continente: ReceiptTotals = { itemsTotal: 400, discountsTotal: -50, paidTotal: 400 };

describe("discountConvention", () => {
  it("counts the discount when items are printed before it", () => {
    expect(discountConvention(pingoDoce)).toBe("discounts-separate");
  });

  it("leaves the discount out when the item price already includes it", () => {
    expect(discountConvention(continente)).toBe("discounts-included");
  });

  it("has nothing to decide when there are no discounts", () => {
    expect(discountConvention({ itemsTotal: 500, discountsTotal: 0, paidTotal: 500 })).toBe("no-discounts");
  });

  it("reports a mismatch when neither convention explains the numbers", () => {
    // 807 - 50 is 757, not 700, and 807 isn't 700 either: something was misread
    expect(discountConvention({ itemsTotal: 807, discountsTotal: -50, paidTotal: 700 })).toBe("mismatch");
  });

  it("reports a mismatch when there are no discounts but the total disagrees", () => {
    expect(discountConvention({ itemsTotal: 500, discountsTotal: 0, paidTotal: 480 })).toBe("mismatch");
  });

  it("treats a positive discount total as a misread rather than guessing", () => {
    // discounts are normalised negative upstream; a positive one means the sign was lost
    expect(discountConvention({ itemsTotal: 649, discountsTotal: 50, paidTotal: 699 })).toBe("mismatch");
  });

  it("is exact to the cent — one cent out is a mismatch, not a rounding matter", () => {
    expect(discountConvention({ itemsTotal: 699, discountsTotal: -50, paidTotal: 650 })).toBe("mismatch");
    expect(discountConvention({ itemsTotal: 699, discountsTotal: -50, paidTotal: 648 })).toBe("mismatch");
  });

  it("handles a fully discounted receipt", () => {
    expect(discountConvention({ itemsTotal: 300, discountsTotal: -300, paidTotal: 0 })).toBe("discounts-separate");
  });

  it("handles an all-zero receipt without calling it a mismatch", () => {
    expect(discountConvention({ itemsTotal: 0, discountsTotal: 0, paidTotal: 0 })).toBe("no-discounts");
  });

  it("refuses non-integer input rather than comparing floats", () => {
    expect(() => discountConvention({ itemsTotal: 6.99, discountsTotal: -0.5, paidTotal: 6.49 })).toThrow();
  });
});

describe("countsDiscountLines", () => {
  it("leaves them out only when the item prices already include them", () => {
    expect(countsDiscountLines("discounts-included")).toBe(false);
    expect(countsDiscountLines("discounts-separate")).toBe(true);
    expect(countsDiscountLines("no-discounts")).toBe(true);
  });

  it("keeps counting them on a mismatch, so a misread receipt behaves as it does today", () => {
    expect(countsDiscountLines("mismatch")).toBe(true);
  });
});

describe("conventionSentence", () => {
  it("reads correctly for a single discount", () => {
    expect(conventionSentence("discounts-included", 1, false)).toBe(
      "These prices already include the discount, so I left that line out."
    );
    expect(conventionSentence("discounts-separate", 1, true)).toBe(
      "That discount is a separate line on the receipt, so I counted it."
    );
  });

  it("reads correctly for several", () => {
    expect(conventionSentence("discounts-included", 3, false)).toBe(
      "These prices already include the discounts, so I left those 3 lines out."
    );
    expect(conventionSentence("discounts-separate", 3, true)).toBe(
      "Those 3 discounts are separate lines on the receipt, so I counted them."
    );
  });

  it("admits uncertainty on a mismatch and says which way it went", () => {
    expect(conventionSentence("mismatch", 1, true)).toContain("couldn't tell whether that discount is");
    expect(conventionSentence("mismatch", 1, true)).toContain("It's counted");
    expect(conventionSentence("mismatch", 2, false)).toContain("those 2 discounts are");
    expect(conventionSentence("mismatch", 2, false)).toContain("They're left out");
  });

  it("never produces a number disagreeing with its own verb", () => {
    for (const convention of ["discounts-included", "discounts-separate", "mismatch"] as const) {
      for (const count of [1, 2, 5]) {
        for (const counting of [true, false]) {
          const s = conventionSentence(convention, count, counting);
          expect(s).not.toMatch(/\b1 discounts\b/);
          expect(s).not.toMatch(/\bthose 1\b/);
          if (count > 1) expect(s).not.toMatch(/\bthat discount is\b/);
        }
      }
    }
  });
});

describe("applyConvention", () => {
  const item = (over: Partial<Item> = {}): Item => ({
    id: "i1", name: "Sumo", quantity: 1, lineTotal: 400, assignment: { kind: "unassigned" }, ...over,
  });

  it("marks discount lines informational when the prices already include them", () => {
    const out = applyConvention([item(), item({ id: "d1", lineTotal: -50, discountLine: true })], "discounts-included");
    expect(out[0].informational).toBeUndefined();
    expect(out[1].informational).toBe(true);
  });

  it("unmarks them when they are separate lines, leaving no stale flag behind", () => {
    const out = applyConvention(
      [item(), item({ id: "d1", lineTotal: -50, discountLine: true, informational: true })],
      "discounts-separate"
    );
    expect(out[1]).not.toHaveProperty("informational");
  });

  it("never touches a negative item line, which is a refund and counts either way", () => {
    const refund = item({ id: "r1", name: "Devolução", lineTotal: -200 });
    expect(applyConvention([refund], "discounts-included")).toEqual([refund]);
  });

  it("returns the same objects when nothing needs changing", () => {
    const items = [item(), item({ id: "d1", discountLine: true })];
    const out = applyConvention(items, "discounts-separate");
    expect(out[0]).toBe(items[0]);
    expect(out[1]).toBe(items[1]);
  });

  it("round-trips: included then separate restores the original", () => {
    const items = [item(), item({ id: "d1", lineTotal: -50, discountLine: true })];
    const there = applyConvention(items, "discounts-included");
    const back = applyConvention(there, "discounts-separate");
    expect(back).toEqual(items);
  });

  it("counts discount lines for a mismatch, as countsDiscountLines says", () => {
    const out = applyConvention([item({ id: "d1", discountLine: true, informational: true })], "mismatch");
    expect(out[0]).not.toHaveProperty("informational");
  });
});

describe("the two real receipt shapes from the notes", () => {
  it("reads the Pingo Doce example the way the paper does", () => {
    // Batatas 2.49 + Sumo 4.50, (Desconto -0.50), TOTAL 6.99, VALOR A PAGAR 6.49
    const c = discountConvention(pingoDoce);
    expect(c).toBe("discounts-separate");
    // counting the discount reproduces what was actually paid
    expect(pingoDoce.itemsTotal + pingoDoce.discountsTotal).toBe(649);
    expect(countsDiscountLines(c)).toBe(true);
  });

  it("reads the Continente example without subtracting twice", () => {
    // Sumo 4.00 (already down from 4.50), (Desconto 0.50), TOTAL A PAGAR 4.00
    const c = discountConvention(continente);
    expect(c).toBe("discounts-included");
    expect(countsDiscountLines(c)).toBe(false);
    // the double-subtraction this prevents would have charged 3.50 for a 4.00 receipt
    expect(continente.itemsTotal + continente.discountsTotal).toBe(350);
  });
});
