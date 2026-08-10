/**
 * Everything about reading a receipt that is not about *who* is calling the model.
 *
 * Shared deliberately: the app scans directly with the user's own key today, and the
 * Cloudflare Worker scans with the app's key on their behalf. The prompt and the schema are
 * load-bearing — they decide which printed total is captured and which lines are discounts —
 * so there must be exactly one copy of them.
 */
import { z } from "zod";
import type { ReceiptTotals } from "./discounts";

/**
 * Sonnet 5, chosen for one reason: **image resolution**.
 *
 * A plain constant, not an env lookup: this module is imported by both the browser app and the
 * Cloudflare Worker, and only one of those has `import.meta.env`. The Worker can still override
 * it per-deploy via its own binding.
 *
 * Haiku 4.5 caps images at 1568px on the long edge. Sonnet 5 is the first Sonnet-tier model with
 * high-resolution vision, at 2576px — and on a creased receipt photographed in a holiday kitchen,
 * resolution *is* accuracy. Haiku was tried on real receipts and misread most of them.
 *
 * Opus 4.8 has the same 2576px ceiling at 2.5x the price, so it is the fallback if Sonnet is ever
 * not good enough rather than the default.
 */
export const SCAN_MODEL = "claude-sonnet-5";

/**
 * The long edge to downscale a photo to before sending it.
 *
 * Matches the model's ceiling: sending more is wasted bytes, sending less throws away the detail
 * that decides whether "1,19" reads as 1.19 or 7.19. At 2576px a receipt costs roughly a cent to
 * read, which is the whole reason a bigger image is worth it.
 */
export const SCAN_IMAGE_MAX_EDGE = 2576;

export const ScanResultSchema = z.object({
  storeName: z.string(),
  date: z.string().nullable(),
  currency: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int(),
      lineTotal: z.number().int(),
      /**
       * Whether this line is something bought or a discount applied to the line above it.
       * Asked for explicitly because the two are indistinguishable by shape, and whether a
       * discount counts towards the split depends on the store's convention — see
       * `discountConvention` in ./discounts.
       */
      kind: z.enum(["item", "discount"]),
    })
  ),
  /**
   * What was actually paid — the "valor a pagar" / "total a pagar" figure. Named to stop the
   * model choosing between two printed totals: a Pingo Doce receipt shows both a pre-discount
   * TOTAL and the amount paid, and capturing the wrong one is the bug that started all this.
   */
  paidTotal: z.number().int(),
  /** The pre-discount subtotal when the receipt prints one separately, else null. */
  preDiscountTotal: z.number().int().nullable(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ScanItem = ScanResult["items"][number];


export const PROMPT = `Read this grocery receipt photo.

The "items" array is ONLY the shopping: the lines for things bought, and the discount lines that
apply to them. It is NOT a transcript of the receipt.

NEVER put a total in "items". No line whose printed label is a total, subtotal or payment belongs
there, however it is worded, including: TOTAL, SUBTOTAL, TOTAL A PAGAR, VALOR A PAGAR, A PAGAR,
TOTAL COMPRA, TOTAL EUR, IVA, TROCO, CARTAO, MULTIBANCO, CONTACTLESS, NUMERARIO, DINHEIRO,
ARREDONDAMENTO. Those figures belong in "paidTotal" and "preDiscountTotal" and nowhere else. If
you are unsure whether a line is an item or a total, leave it out — a missing item is easy for the
person to add, a duplicated total silently multiplies what everybody owes.

For each shopping line, in the order they appear:
- "name": the printed name, lightly cleaned up but kept in its original language.
- "quantity": integer number of units on the line (1 for weight-priced lines).
- "lineTotal": the amount printed on that line, in integer cents.
- "kind": "item" for something bought, "discount" for a discount applied to the line above it.
  Discount lines are usually indented and often in brackets, with wording like "Desconto",
  "Poupança", "Cartão", "Talão desconto". Report the amount as printed, whether or not the
  receipt shows a minus sign — do not decide the sign yourself.
  Bottle deposits and bag fees are "item", not "discount". A refund or corrected line is an
  "item" with a negative lineTotal.
- "paidTotal": the amount ACTUALLY PAID, in integer cents. Many receipts print two totals: a
  pre-discount subtotal (often "TOTAL") and the amount paid (often "VALOR A PAGAR",
  "TOTAL A PAGAR", "A PAGAR"). Always report the amount paid here, never the pre-discount one.
- "preDiscountTotal": the pre-discount subtotal, in integer cents, only when the receipt prints
  one as a separate figure from the amount paid. Otherwise null.
- "currency": ISO 4217 code of the printed currency. A "€" sign, a "EUR" suffix, or prices
  written as "1,19" with a comma is "EUR". Only report something else if the receipt clearly
  shows another currency's symbol or code.
- "date": purchase date as YYYY-MM-DD if printed, else null.
Do not invent lines. Read the printed digits — never round, estimate, or carry a figure across
from another line. Before you answer, check that no entry in "items" is a total, and that the
items plausibly add up to either "paidTotal" or "preDiscountTotal".`;

/**
 * Force every discount line negative. Continente prints discounts unsigned, so the model is
 * told to copy what the paper says rather than guess — which means the sign has to be settled
 * here. It matters more than it looks: a discount left positive can coincidentally satisfy the
 * "discounts are separate lines" test and pick the wrong convention with total confidence.
 * Item lines are never touched, because a refund is legitimately negative.
 */
export function normaliseDiscountSigns(result: ScanResult): ScanResult {
  return {
    ...result,
    items: result.items.map((i) =>
      i.kind === "discount" && i.lineTotal > 0 ? { ...i, lineTotal: -i.lineTotal } : i
    ),
  };
}

/** Split a scan into the three totals `discountConvention` needs. */
export function scanTotals(result: ScanResult): ReceiptTotals {
  let itemsTotal = 0;
  let discountsTotal = 0;
  for (const line of result.items) {
    if (line.kind === "discount") discountsTotal += line.lineTotal;
    else itemsTotal += line.lineTotal;
  }
  return { itemsTotal, discountsTotal, paidTotal: result.paidTotal };
}
