/**
 * Which convention a receipt follows for printing discounts, worked out from the receipt's own
 * arithmetic rather than from the store's name.
 *
 * Portuguese chains print discounts two incompatible ways that look identical to a scanner —
 * an indented bracketed amount under an item line:
 *
 *   Pingo Doce   item prices are pre-discount, the discount is its own line
 *   Continente   item prices are already reduced, the bracket is information only
 *
 * Counting the Continente bracket subtracts a discount that was already applied; ignoring the
 * Pingo Doce one leaves the receipt overstated. The bracket's sign is no help — Continente
 * prints it unsigned — but the totals disambiguate on their own.
 */

import type { Item } from "../types";

/** All amounts in integer cents. Discounts are normalised negative before they reach here. */
export type ReceiptTotals = {
  /** Sum of the real item lines, as printed. */
  itemsTotal: number;
  /** Sum of the discount lines, negative. Zero when the receipt has none. */
  discountsTotal: number;
  /** What was actually paid — the "valor a pagar" figure, not a pre-discount subtotal. */
  paidTotal: number;
};

export type DiscountConvention =
  /** Discounts are separate lines: count them. `itemsTotal + discountsTotal === paidTotal`. */
  | "discounts-separate"
  /** Item prices already include them: keep the lines visible, leave them out of the maths. */
  | "discounts-included"
  /** No discounts on the receipt, and the total agrees. Nothing to decide. */
  | "no-discounts"
  /** Neither convention explains the numbers, so something was misread. Change nothing. */
  | "mismatch";

export function discountConvention(totals: ReceiptTotals): DiscountConvention {
  const { itemsTotal, discountsTotal, paidTotal } = totals;
  if (![itemsTotal, discountsTotal, paidTotal].every(Number.isInteger)) {
    throw new Error("discountConvention needs integer cents");
  }

  // A positive discount total means the sign was lost upstream. It can coincidentally satisfy
  // the separate-lines test, so reject it before testing rather than infer from bad input.
  if (discountsTotal > 0) return "mismatch";

  const separate = itemsTotal + discountsTotal === paidTotal;
  const included = itemsTotal === paidTotal;

  // Both hold only when there is nothing to discount, which is not a convention question.
  if (discountsTotal === 0) return included ? "no-discounts" : "mismatch";
  if (separate) return "discounts-separate";
  if (included) return "discounts-included";
  return "mismatch";
}

/**
 * Whether the discount lines should be counted in the item sum used for splitting.
 * A mismatch counts them, matching what the app did before this decision existed: the totals
 * are already being questioned on screen, so this is not the moment to also change the maths.
 */
export function countsDiscountLines(convention: DiscountConvention): boolean {
  return convention !== "discounts-included";
}

/**
 * The one sentence the review screen shows about the receipt's discounts. Kept here beside the
 * decision it describes, and written out per count rather than assembled from fragments —
 * "These 1 discount line are separate lines" is how the assembled version reads.
 *
 * `counting` comes from the lines themselves rather than from the convention, so the sentence
 * describes what is actually true even if stored data disagrees with its own verdict.
 */
export function conventionSentence(
  convention: DiscountConvention,
  discountCount: number,
  counting: boolean
): string {
  const one = discountCount === 1;
  if (convention === "mismatch") {
    const subject = one ? "that discount is" : `those ${discountCount} discounts are`;
    const state = counting ? (one ? "It's counted" : "They're counted") : one ? "It's left out" : "They're left out";
    return `I couldn't tell whether ${subject} already included in the prices above. ${state} — switch if that's wrong.`;
  }
  if (counting) {
    return one
      ? "That discount is a separate line on the receipt, so I counted it."
      : `Those ${discountCount} discounts are separate lines on the receipt, so I counted them.`;
  }
  return one
    ? "These prices already include the discount, so I left that line out."
    : `These prices already include the discounts, so I left those ${discountCount} lines out.`;
}

/**
 * Apply a convention to a receipt's lines: every line the scanner read as a discount is marked
 * informational, or unmarked, to match. Only discount lines are touched — a negative item line
 * is a refund and counts either way.
 *
 * The stored verdict is deliberately not recomputed when the user edits a price. Recomputing
 * would let the convention flip underneath someone who is halfway through fixing a misread
 * number, which is worse than a stale verdict they can see and overrule.
 */
export function applyConvention(items: Item[], convention: DiscountConvention): Item[] {
  const counted = countsDiscountLines(convention);
  return items.map((item) => {
    if (!item.discountLine) return item;
    if (counted) {
      if (!item.informational) return item;
      const { informational: _dropped, ...rest } = item;
      return rest;
    }
    return item.informational ? item : { ...item, informational: true };
  });
}
